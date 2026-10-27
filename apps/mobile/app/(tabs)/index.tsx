import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_META } from '@appinity/shared';
import { Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMe } from '../../src/api/queries';
import { AuraBackdrop } from '../../src/components/Aura';
import { DataBanner } from '../../src/components/DataBanner';
import { RecommendationCard, type RecommendationCardHandle } from '../../src/components/RecommendationCard';
import { Button, Card, EmptyState, ErrorCard, Loading, Screen, Skeleton, Small, Title } from '../../src/components/ui';
import { LastActionBar, VoteBar } from '../../src/components/Vote';
import { useHomeDeck } from '../../src/state/homeDeck';
import { secureStorage } from '../../src/state/secure-storage';
import { fonts, radius, spacing, usePalette } from '../../src/theme';

/** La ayuda de gestos se muestra solo en las primeras tarjetas; después ocupa sitio sin aportar. */
const HINT_KEY = 'appinity.deckHintUses';
const HINT_LIMIT = 3;

function useDeckHint() {
  const [uses, setUses] = useState<number | null>(null);
  useEffect(() => {
    void secureStorage.get(HINT_KEY).then((v) => setUses(Number(v) || 0));
  }, []);
  return {
    visible: uses !== null && uses < HINT_LIMIT,
    used: () =>
      setUses((prev) => {
        const next = (prev ?? 0) + 1;
        if (next <= HINT_LIMIT) void secureStorage.set(HINT_KEY, String(next));
        return next;
      }),
  };
}

/** Tarjeta siguiente del mazo: solo se muestra, no responde a gestos. */
const noop = () => undefined;

/**
 * Home (§2, modelo binario + «Me encanta», 2026-10-27): tarjetas de recomendación (70/20/10 cuando hay candidatos).
 * Derecha «Me gusta», izquierda «No me gusta», doble toque «Me encanta» (cuentan para tus gustos y tus almas gemelas);
 * arriba «Guardar» y abajo «Paso» (no cuentan; lo pasado vuelve al mes). Cada gesto tiene su botón. Si no hay
 * recomendaciones, se explica por qué; no se inventan.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const userId = me.data?.user.id;
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { width } = useWindowDimensions();
  // El halo toma el color de la categoría de la tarjeta actual y queda detrás de todo (también de la marca).
  const [aura, setAura] = useState<string | null>(null);
  return (
    <Screen>
      {aura ? <AuraBackdrop color={aura} width={width} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, minHeight: width * 2.2 }} /> : null}
      <Text
        accessibilityRole="header"
        accessibilityLabel="APPINITY"
        style={{ marginTop: insets.top - spacing.sm, color: c.text, fontFamily: fonts.displayHeavy, fontSize: 24, letterSpacing: -1 }}
      >
        appinity<Text style={{ color: c.accent }}>.</Text>
      </Text>
      <DataBanner />
      {/* Un mazo por usuario: al cambiar de sesión empieza de cero (sin la cola ni el historial de otra persona). */}
      {userId ? <HomeDeckSection key={userId} onAura={setAura} /> : <Loading />}
      {/* Guía de la demo: solo con datos simulados; en una cuenta real «Tus gustos» está en Perfil. */}
      {me.data?.user.dataset === 'live' ? null : (
      <Card>
        <Title>{t('home.whatYouCanTest')}</Title>
        <Small>• {t('home.testActions')}</Small>
        <Small>• {t('home.testKnown')}</Small>
        <Button label={t('home.openModel')} icon="database-search-outline" variant="secondary" onPress={() => router.push('/model')} />
        <Button label={t('home.openCategories')} icon="shape-outline" variant="secondary" onPress={() => router.push('/categories')} />
      </Card>
      )}
    </Screen>
  );
}

function HomeDeckSection({ onAura }: { onAura: (color: string | null) => void }) {
  const { t } = useTranslation();
  const hint = useDeckHint();
  const router = useRouter();
  const deck = useHomeDeck(true);
  const card = useRef<RecommendationCardHandle>(null);
  const auraColor = deck.current ? CATEGORY_META[deck.current.item.category].color : null;
  useEffect(() => onAura(auraColor), [auraColor, onAura]);
  const emptyReason =
    deck.meta?.localFilter === 'no_location' ? t('home.emptyNoLocation') : t('home.emptyNoSoulmates');

  return (
    <>
      {deck.loading ? <Skeleton rows={1} height={460} /> : null}
      {deck.error ? <ErrorCard error={deck.error} onRetry={deck.reload} /> : null}
      {deck.current ? (
        <View style={{ gap: spacing.md }}>
          <View>
            {deck.next ? (
              // La siguiente tarjeta, debajo y quieta: se descubre al deslizar la actual. Sin gestos y oculta al lector
              // de pantalla; la impresión solo se registra cuando pasa a ser la actual.
              <View
                key={`next-${deck.next.item.id}`}
                pointerEvents="none"
                aria-hidden
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: radius.xl, transform: [{ translateY: 10 }, { scale: 0.95 }, { rotate: '3deg' }], opacity: 0.55 }}
              >
                <RecommendationCard recommendation={deck.next} onAction={noop} interactive={false} />
              </View>
            ) : null}
            <RecommendationCard
              key={deck.current.item.id}
              ref={card}
              recommendation={deck.current}
              onAction={(action) => {
                hint.used();
                void deck.apply(action);
              }}
              interactive={!deck.busy}
            />
          </View>
          {hint.visible ? <Small style={{ textAlign: 'center' }}>{t('home.gestureHint')}</Small> : null}
          {/* Los botones lanzan la tarjeta con la misma animación y el mismo sello que el gesto. */}
          <VoteBar onAction={(action) => card.current?.fling(action)} disabled={deck.busy} />
          <LastActionBar entry={deck.last} onUndo={() => void deck.undo()} disabled={!deck.canUndo} />
        </View>
      ) : null}
      {!deck.loading && !deck.current && !deck.error && deck.exhausted ? (
        <>
          <EmptyState
            icon={deck.meta?.localFilter === 'no_location' ? 'map-marker-outline' : 'compass-outline'}
            title={t('home.emptyTitle')}
            body={emptyReason}
            action={{ label: t('home.openSources'), icon: 'link-variant', onPress: () => router.push('/sources') }}
            secondary={{ label: t('home.reload'), icon: 'refresh', onPress: deck.reload }}
          />
          <LastActionBar entry={deck.last} onUndo={() => void deck.undo()} disabled={!deck.canUndo} />
        </>
      ) : null}
    </>
  );
}

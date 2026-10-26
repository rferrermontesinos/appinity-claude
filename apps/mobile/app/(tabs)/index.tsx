import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useMe } from '../../src/api/queries';
import { DataBanner } from '../../src/components/DataBanner';
import { RecommendationCard } from '../../src/components/RecommendationCard';
import { Button, Card, EmptyState, ErrorCard, Loading, Screen, Small, Title } from '../../src/components/ui';
import { useHomeDeck } from '../../src/state/homeDeck';
import { spacing, usePalette } from '../../src/theme';

/** Botones del mazo (sistema de diseño): descartar y conservar grandes; conservar relleno en violeta; deshacer pequeño. */
function DeckButton({ icon, label, onPress, disabled, kind }: { icon: 'close' | 'undo' | 'heart'; label: string; onPress: () => void; disabled: boolean; kind: 'dismiss' | 'undo' | 'keep' }) {
  const c = usePalette();
  const size = kind === 'undo' ? 48 : 64;
  const bg = kind === 'keep' ? c.accent : c.surfaceAlt;
  const fg = kind === 'keep' ? c.accentText : kind === 'dismiss' ? c.danger : c.onSurfaceAlt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={kind === 'undo' ? 8 : 0}
      style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <MaterialCommunityIcons name={icon} size={kind === 'undo' ? 22 : 30} color={fg} />
      </View>
    </Pressable>
  );
}

/**
 * Home (§2): tarjetas de recomendación (70/20/10 cuando hay candidatos) con descartar, deshacer y conservar, por gesto o
 * botón. Ninguna acción cambia los gustos. Si no hay recomendaciones, se explica por qué; no se inventan.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const userId = me.data?.user.id;
  return (
    <Screen>
      <DataBanner />
      {/* Un mazo por usuario: al cambiar de sesión empieza de cero (sin la cola ni el historial de otra persona). */}
      {userId ? <HomeDeckSection key={userId} /> : <Loading />}
      {/* Guía de la demo: solo con datos simulados; en una cuenta real «Tus gustos» está en Perfil. */}
      {me.data?.user.dataset === 'live' ? null : (
      <Card>
        <Title style={{ fontSize: 16 }}>{t('home.whatYouCanTest')}</Title>
        <Small>• {t('home.testActions')}</Small>
        <Small>• {t('home.testKnown')}</Small>
        <Button label={t('home.openModel')} icon="database-search-outline" variant="secondary" onPress={() => router.push('/model')} />
        <Button label={t('home.openCategories')} icon="shape-outline" variant="secondary" onPress={() => router.push('/categories')} />
      </Card>
      )}
    </Screen>
  );
}

function HomeDeckSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const deck = useHomeDeck(true);
  const emptyReason =
    deck.meta?.localFilter === 'no_location' ? t('home.emptyNoLocation') : t('home.emptyNoSoulmates');

  return (
    <>
      {deck.loading ? <Loading /> : null}
      {deck.error ? <ErrorCard error={deck.error} onRetry={deck.reload} /> : null}
      {deck.current ? (
        <View style={{ gap: spacing.md }}>
          <View>
            {deck.next ? (
              // Borde decorativo del mazo: indica que hay más tarjetas sin mostrar (ni leer) la siguiente antes de tiempo.
              <View
                pointerEvents="none"
                style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, top: 12, bottom: -12, borderRadius: 28, backgroundColor: c.surfaceAlt, opacity: 0.7 }}
              />
            ) : null}
            <RecommendationCard key={deck.current.item.id} recommendation={deck.current} onDismiss={() => void deck.dismiss()} onKeep={() => void deck.keep()} interactive={!deck.busy} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xl }}>
            <DeckButton icon="close" kind="dismiss" label={t('home.dismiss')} onPress={() => void deck.dismiss()} disabled={deck.busy} />
            <DeckButton icon="undo" kind="undo" label={t('home.undo')} onPress={() => void deck.undo()} disabled={!deck.canUndo} />
            <DeckButton icon="heart" kind="keep" label={t('home.keep')} onPress={() => void deck.keep()} disabled={deck.busy} />
          </View>
          <Small style={{ textAlign: 'center' }}>{t('home.gestureHint')}</Small>
        </View>
      ) : null}
      {!deck.loading && !deck.current && !deck.error && deck.exhausted ? (
        <EmptyState
          icon={deck.meta?.localFilter === 'no_location' ? 'map-marker-outline' : 'compass-outline'}
          title={t('home.emptyTitle')}
          body={emptyReason}
          action={{ label: t('home.openSources'), icon: 'link-variant', onPress: () => router.push('/profile') }}
          secondary={deck.canUndo ? { label: t('home.undo'), icon: 'undo', onPress: () => void deck.undo() } : { label: t('home.reload'), icon: 'refresh', onPress: deck.reload }}
        />
      ) : null}
    </>
  );
}

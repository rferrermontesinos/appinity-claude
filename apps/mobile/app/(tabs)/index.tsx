import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useMe } from '../../src/api/queries';
import { DataBanner } from '../../src/components/DataBanner';
import { RecommendationCard } from '../../src/components/RecommendationCard';
import { Body, Button, Card, ErrorCard, Loading, Screen, Small, Title } from '../../src/components/ui';
import { useHomeDeck } from '../../src/state/homeDeck';
import { spacing, usePalette } from '../../src/theme';

function DeckButton({ icon, label, onPress, disabled, color }: { icon: 'close' | 'undo' | 'heart-outline'; label: string; onPress: () => void; disabled: boolean; color: string }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', gap: 4, opacity: disabled ? 0.35 : pressed ? 0.7 : 1, minWidth: 72 })}
    >
      <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}>
        <MaterialCommunityIcons name={icon} size={26} color={color} />
      </View>
      <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
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
      <Card>
        <Title style={{ fontSize: 16 }}>{t('home.whatYouCanTest')}</Title>
        <Small>• {t('home.testActions')}</Small>
        <Small>• {t('home.testKnown')}</Small>
        <Button label={t('home.openModel')} icon="database-search-outline" variant="secondary" onPress={() => router.push('/model')} />
        <Button label={t('home.openCategories')} icon="shape-outline" variant="secondary" onPress={() => router.push('/categories')} />
      </Card>
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
                style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, top: 8, bottom: -8, borderRadius: 18, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border }}
              />
            ) : null}
            <RecommendationCard key={deck.current.item.id} recommendation={deck.current} onDismiss={() => void deck.dismiss()} onKeep={() => void deck.keep()} interactive={!deck.busy} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
            <DeckButton icon="close" label={t('home.dismiss')} onPress={() => void deck.dismiss()} disabled={deck.busy} color={c.danger} />
            <DeckButton icon="undo" label={t('home.undo')} onPress={() => void deck.undo()} disabled={!deck.canUndo} color={c.textMuted} />
            <DeckButton icon="heart-outline" label={t('home.keep')} onPress={() => void deck.keep()} disabled={deck.busy} color={c.ok} />
          </View>
          <Small style={{ textAlign: 'center' }}>{t('home.gestureHint')}</Small>
        </View>
      ) : null}
      {!deck.loading && !deck.current && !deck.error && deck.exhausted ? (
        <Card>
          <Title>{t('home.emptyTitle')}</Title>
          <Body muted>{emptyReason}</Body>
          {deck.canUndo ? <Button label={t('home.undo')} icon="undo" variant="secondary" onPress={() => void deck.undo()} /> : null}
          <Button label={t('home.openSources')} icon="link-variant" variant="secondary" onPress={() => router.push('/profile')} />
          <Button label={t('home.reload')} icon="refresh" variant="secondary" onPress={deck.reload} />
        </Card>
      ) : null}
    </>
  );
}

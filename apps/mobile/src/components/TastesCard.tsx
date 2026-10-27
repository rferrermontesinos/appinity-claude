import { CATEGORIES, CATEGORY_META } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useItemProfiles, type ProfileView } from '../api/queries';
import { spacing, usePalette } from '../theme';
import { Badge, Body, Button, Card, Small, Title } from './ui';

/** Umbral de «gusto claro» o «disgusto claro», el mismo que usa el recomendador por contenido. */
export const CLEAR_TASTE = 0.3;

export function tasteSummary(profiles: ProfileView[]) {
  const likes = profiles.filter((p) => (p.preferenceScore ?? 0) >= CLEAR_TASTE).length;
  const dislikes = profiles.filter((p) => (p.preferenceScore ?? 0) <= -CLEAR_TASTE).length;
  // NULL = sin evidencia de gusto (lo conoce o lo ha consumido), no es un «no me gusta».
  const noOpinion = profiles.filter((p) => p.preferenceScore === null).length;
  const byCategory = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const p of profiles) {
    byCategory.set(p.item.category, (byCategory.get(p.item.category) ?? 0) + 1);
    for (const s of p.sources) bySource.set(s, (bySource.get(s) ?? 0) + 1);
  }
  return { total: profiles.length, likes, dislikes, noOpinion, byCategory, bySource };
}

/** Explicabilidad del perfil propio: qué sabe APPINITY de ti y de qué fuente sale cada gusto. */
export function TastesCard() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const profiles = useItemProfiles();
  if (!profiles.data) return null;
  const s = tasteSummary(profiles.data);
  const sources = [...s.bySource.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <Title>{t('tastes.title')}</Title>
      {s.total === 0 ? (
        <Body muted>{t('tastes.empty')}</Body>
      ) : (
        <>
          <Body>{t('tastes.summary', { total: s.total, likes: s.likes, dislikes: s.dislikes })}</Body>
          {s.noOpinion ? <Small>{t('tastes.noOpinion', { count: s.noOpinion })}</Small> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {CATEGORIES.filter((code) => s.byCategory.has(code)).map((code) => (
              <Badge
                key={code}
                label={`${t(`categories.${code}`)} · ${s.byCategory.get(code)}`}
                color={CATEGORY_META[code].color}
                dot
              />
            ))}
          </View>
          <Small style={{ fontWeight: '700', marginTop: spacing.xs }}>{t('tastes.fromSources')}</Small>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {sources.map(([key, count]) => (
              <Badge key={key} label={`${t(`sources.names.${key}`, { defaultValue: key })} · ${count}`} color={c.textMuted} />
            ))}
          </View>
        </>
      )}
      <Small>{t('tastes.onlySources')}</Small>
      {s.total ? (
        <Button label={t('tastes.open')} icon="heart-search" variant="secondary" size="small" onPress={() => router.push('/model')} />
      ) : null}
    </Card>
  );
}

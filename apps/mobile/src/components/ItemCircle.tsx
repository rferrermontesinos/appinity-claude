import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ItemCircleDto } from '@appinity/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { apiRequest } from '../api/client';
import { radius, spacing, type, usePalette } from '../theme';
import { Small } from './ui';

/**
 * «Entre tus almas gemelas» (ficha, 2026-10-27): lo que la tarjeta de Inicio no cuenta. Cuántas de tus 50 almas gemelas
 * más afines han valorado la obra y cómo (barra + leyenda), y a quiénes de los que sigues les gusta. Solo recuentos de
 * almas gemelas; nombres solo de seguidos. Sin valoraciones, se dice tal cual (nada de porcentajes inventados).
 */
export function ItemCircle({ itemId, surface }: { itemId: string; surface: string }) {
  const { t } = useTranslation();
  const c = usePalette();
  const circle = useQuery({ queryKey: ['circle', itemId], queryFn: () => apiRequest<ItemCircleDto>(`/v1/me/home/items/${itemId}/circle`) });
  const data = circle.data;
  if (circle.isError) return <Small style={{ color: c.danger }}>{t('item.circle.error')}</Small>;
  if (!data) return null;

  const levels = [
    { key: 'love', count: data.love, color: c.affinity, icon: 'heart' },
    { key: 'like', count: data.like, color: `${c.affinity}99`, icon: 'thumb-up' },
    { key: 'mixed', count: data.mixed, color: c.neutral, icon: 'minus-circle-outline' },
    { key: 'dislike', count: data.dislike, color: c.negative, icon: 'thumb-down' },
  ] as const;
  const shown = levels.filter((l) => l.count > 0);
  const [first = '', second = ''] = data.followedLikers.names;
  const followed =
    data.followedLikers.count === 0
      ? null
      : data.followedLikers.count === 1
        ? t('item.circle.followedOne', { first })
        : data.followedLikers.count === 2
          ? t('item.circle.followedTwo', { first, second })
          : t('item.circle.followedMore', { first, second, rest: data.followedLikers.count - 2 });
  const summary =
    data.soulmates === 0
      ? t('item.circle.noSoulmates')
      : data.opinionated === 0
        ? t('item.circle.none', { count: data.soulmates })
        : t('item.circle.summary', { count: data.opinionated, soulmates: data.soulmates });
  const barLabel = shown.map((l) => `${t(`item.circle.${l.key}`)}: ${l.count}`).join(', ');

  return (
    <View style={{ gap: spacing.md, backgroundColor: surface, borderRadius: 18, padding: spacing.lg }}>
      <Text accessibilityRole="header" style={{ color: c.text, ...type.h3 }}>
        {t('item.circle.title')}
      </Text>
      <Text style={{ color: c.text, fontSize: 15, lineHeight: 21 }}>{summary}</Text>
      {shown.length ? (
        <>
          {/* Barra de reparto: cada tramo es proporcional al número de almas gemelas de ese nivel. */}
          <View accessible accessibilityLabel={barLabel} style={{ flexDirection: 'row', height: 10, gap: 2, borderRadius: radius.full, overflow: 'hidden' }}>
            {shown.map((l) => (
              <View key={l.key} style={{ flex: l.count, backgroundColor: l.color }} />
            ))}
          </View>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
            {shown.map((l) => (
              <View key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <MaterialCommunityIcons name={l.icon} size={16} color={l.key === 'like' ? c.affinity : l.color} />
                <Text style={{ color: c.textMuted, fontSize: 13 }}>{t(`item.circle.${l.key}`)}</Text>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{l.count}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {followed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <MaterialCommunityIcons name="account-heart-outline" size={18} color={c.primaryInk} />
          <Text style={{ color: c.text, fontSize: 14, flexShrink: 1 }}>{followed}</Text>
        </View>
      ) : null}
      {data.soulmates > 0 ? <Small>{t('item.circle.privacy')}</Small> : null}
    </View>
  );
}

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type AffinityCategoryDto } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { fonts, radius, spacing, usePalette } from '../theme';
import { formatAffinity } from './PersonAvatar';

/**
 * Barra de afinidad por categoría («Aura»): icono y nombre, recuento de gustos en común (solo el número, nunca cuáles),
 * barra en el color de la categoría y cifra en Bricolage. Sin datos (NULL), «—» y barra vacía, nunca 0 %.
 */
export function CategoryAffinityBar({ item }: { item: AffinityCategoryDto }) {
  const { t } = useTranslation();
  const c = usePalette();
  const meta = CATEGORY_META[item.category];
  const value = formatAffinity(item.score);
  const label = t(`categories.${item.category}`);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value === null ? t('people.noData') : t('people.affinityValue', { value })}${item.commonItems ? `, ${t('people.commonItems', { count: item.commonItems })}` : ''}`}
      style={{ gap: 6, paddingVertical: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <MaterialCommunityIcons name={meta.icon as never} size={18} color={value === null ? c.textSubtle : c.text} />
        <Text style={{ flex: 1, color: value === null ? c.textMuted : c.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {label}
          {item.commonItems ? <Text style={{ color: c.textMuted, fontWeight: '400' }}> · {t('people.commonItems', { count: item.commonItems })}</Text> : null}
        </Text>
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 18, color: value === null ? c.textSubtle : c.text }}>{value ?? '—'}</Text>
      </View>
      <View style={{ height: 8, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        {item.score !== null ? <View style={{ width: `${Math.max(2, Math.min(100, item.score))}%`, height: '100%', borderRadius: radius.full, backgroundColor: meta.color }} /> : null}
      </View>
    </View>
  );
}

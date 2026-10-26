import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type Category } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { fonts, radius, spacing, usePalette } from '../theme';
import { formatAffinity } from './PersonAvatar';

/**
 * Medidor de afinidad (sistema de diseño): cifra grande en Space Grotesk y violeta apto para texto. Sin objetos en
 * común (NULL) se muestra «—» en gris, nunca 0 %.
 */
export function AffinityFigure({ score, caption, size = 'lg' }: { score: number | null; caption?: string; size?: 'md' | 'lg' }) {
  const { t } = useTranslation();
  const c = usePalette();
  const value = formatAffinity(score);
  const big = size === 'lg' ? 76 : 36;
  return (
    <View accessibilityLabel={`${t('people.affinity')} ${value === null ? '—' : t('people.affinityValue', { value })}`} style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontFamily: fonts.display, fontSize: big, lineHeight: big * 1.02, letterSpacing: -big * 0.04, color: value === null ? c.textMuted : c.affinity }}>
        {value ?? '—'}
        {value !== null ? <Text style={{ fontSize: big * 0.42, letterSpacing: 0 }}>%</Text> : null}
      </Text>
      {caption ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{caption}</Text> : null}
    </View>
  );
}

/** Barra por categoría: chip con icono en su color, barra rellena con el color de la categoría y cifra tabular. */
export function CategoryAffinityBar({ category, score }: { category: Category; score: number | null }) {
  const { t } = useTranslation();
  const c = usePalette();
  const meta = CATEGORY_META[category];
  const value = formatAffinity(score);
  return (
    <View
      accessibilityLabel={`${t(`categories.${category}`)}: ${value === null ? t('people.noData') : t('people.affinityValue', { value })}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 112, height: 28, borderRadius: radius.full, paddingLeft: spacing.sm, backgroundColor: `${meta.color}33` }}>
        <MaterialCommunityIcons name={meta.icon as never} size={15} color={meta.color} />
        <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
          {t(`categories.${category}`)}
        </Text>
      </View>
      <View style={{ flex: 1, height: 8, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        {score !== null ? <View style={{ width: `${Math.max(2, Math.min(100, score))}%`, height: '100%', borderRadius: radius.full, backgroundColor: meta.color }} /> : null}
      </View>
      <Text style={{ width: 34, textAlign: 'right', fontFamily: fonts.display, fontSize: 14, color: value === null ? c.textMuted : c.text }}>{value ?? '—'}</Text>
    </View>
  );
}

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type Category } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { onImage, radius, spacing } from '../theme';

/** Velo de 16 bandas en curva (sin degradados nativos): de transparente a 0,9 sin escalones visibles. */
const VEIL = Array.from({ length: 16 }, (_, i) => Math.round(0.9 * (i / 15) ** 1.6 * 1000) / 1000);

/** Oscurece la parte inferior de una imagen para que el texto claro encima cumpla AA (sistema de diseño). */
export function ImageVeil({ height = '62%' }: { height?: `${number}%` }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      {VEIL.map((opacity, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: `rgba(18,17,16,${opacity})` }} />
      ))}
    </View>
  );
}

/** Chip de categoría sobre imagen: cristal oscuro, icono en el color de la categoría y texto claro. */
export function CategoryChipOnImage({ category }: { category: Category }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[category];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', backgroundColor: onImage.glass, borderRadius: radius.full, paddingVertical: 5, paddingLeft: spacing.sm, paddingRight: spacing.md }}>
      <MaterialCommunityIcons name={meta.icon as never} size={16} color={meta.color} />
      <Text style={{ color: onImage.text, fontSize: 12, fontWeight: '600' }}>{t(`categories.${category}`)}</Text>
    </View>
  );
}

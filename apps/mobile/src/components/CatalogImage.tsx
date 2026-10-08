import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type CatalogImage as CatalogImageModel, type Category } from '@appinity/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

/** Imagen de sustitución de la categoría: diseño propio, nunca una foto inventada del contenido. */
export function CategoryFallback({ category, style, compact }: { category: Category; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[category];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t('item.imageFallback')}
      style={[{ backgroundColor: `${meta.color}33`, alignItems: 'center', justifyContent: 'center', gap: 4 }, style]}
    >
      <MaterialCommunityIcons name={meta.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={compact ? 22 : 40} color={meta.color} />
      {compact ? null : (
        <Text style={{ color: meta.color, fontWeight: '700', fontSize: 12 }}>{t(`categories.${category}`)}</Text>
      )}
    </View>
  );
}

/**
 * Imagen del catálogo. Si el DTO trae el fallback, o si la carga falla (red, URL caducada), se muestra la
 * imagen de sustitución de la categoría.
 */
export function CatalogImage({
  image,
  category,
  style,
  compact,
  contentFit = 'cover',
}: {
  image: CatalogImageModel;
  category: Category;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  contentFit?: 'cover' | 'contain';
}) {
  const [failed, setFailed] = useState(false);
  if (image.isFallback || failed) return <CategoryFallback category={category} style={style} compact={compact} />;
  return (
    <Image
      source={{ uri: image.url }}
      style={style as StyleProp<ImageStyle>}
      contentFit={contentFit}
      transition={150}
      cachePolicy="memory-disk"
      accessibilityLabel={image.alt}
      onError={() => setFailed(true)}
    />
  );
}

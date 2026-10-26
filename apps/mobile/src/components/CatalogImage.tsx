import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type CatalogImage as CatalogImageModel, type Category } from '@appinity/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { fonts } from '../theme';

/** Fondo de cartel: oscuro siempre (como un póster), teñido con el color de la categoría y una forma translúcida. */
function PosterBackdrop({ category }: { category: Category }) {
  const color = CATEGORY_META[category].color;
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: POSTER_BASE }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: 0.32 }]} />
      <View style={{ position: 'absolute', width: 360, height: 360, borderRadius: 180, top: -110, right: -130, backgroundColor: color, opacity: 0.45 }} />
      <View style={{ position: 'absolute', width: 240, height: 240, borderRadius: 120, bottom: 60, left: -120, backgroundColor: color, opacity: 0.22 }} />
    </>
  );
}

const POSTER_BASE = '#141210';

/**
 * Imagen de sustitución de la categoría: diseño propio, nunca una foto inventada del contenido. En grande es un cartel
 * (fondo teñido y el icono de la categoría); el título ya lo pinta la tarjeta encima. En miniatura, solo el icono.
 */
export function CategoryFallback({ category, style, compact }: { category: Category; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[category];
  const icon = meta.icon as keyof typeof MaterialCommunityIcons.glyphMap;
  const label = t(`categories.${category}`);
  if (compact) {
    return (
      <View accessibilityRole="image" accessibilityLabel={t('item.imageFallback')} style={[{ backgroundColor: `${meta.color}33`, alignItems: 'center', justifyContent: 'center' }, style]}>
        <MaterialCommunityIcons name={icon} size={22} color={meta.color} />
      </View>
    );
  }
  return (
    <View accessibilityRole="image" accessibilityLabel={t('item.imageFallback')} style={[{ overflow: 'hidden' }, style]}>
      <PosterBackdrop category={category} />
      {/* Textura tipográfica: el nombre de la categoría, enorme y casi transparente, como en un cartel. */}
      <View style={{ position: 'absolute', top: '18%', left: -8, right: -200 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[0, 1, 2].map((i) => (
          <Text
            key={i}
            numberOfLines={1}
            ellipsizeMode="clip"
            allowFontScaling={false}
            style={{ color: '#FFFFFF', opacity: 0.09 - i * 0.025, fontFamily: fonts.display, fontSize: 84, lineHeight: 88, letterSpacing: -2, textTransform: 'uppercase' }}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Logotipo del título: entero (sin recortar) en la parte alta de un cartel; abajo queda sitio para el texto de la tarjeta. */
function LogoPoster({ image, category, style, compact, onError }: { image: CatalogImageModel; category: Category; style?: StyleProp<ViewStyle>; compact?: boolean; onError: () => void }) {
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <PosterBackdrop category={category} />
      <Image
        source={{ uri: image.url }}
        style={compact ? { position: 'absolute', top: '15%', left: '12%', right: '12%', bottom: '15%' } : { position: 'absolute', top: '12%', left: '12%', right: '12%', height: '42%' }}
        contentFit="contain"
        transition={150}
        cachePolicy="memory-disk"
        accessibilityLabel={image.alt}
        onError={onError}
      />
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
  if (image.kind === 'logo') return <LogoPoster image={image} category={category} style={style} compact={compact} onError={() => setFailed(true)} />;
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

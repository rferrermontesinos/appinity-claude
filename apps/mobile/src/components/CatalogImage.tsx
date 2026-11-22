import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type CatalogImage as CatalogImageModel, type Category } from '@appinity/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { fonts, onImage } from '../theme';
import { Grain, mixHex } from './Aura';

/** Fondo de cartel «Aura»: oscuro siempre (como un póster), teñido con la categoría, un brillo, una banda y grano. */
function PosterBackdrop({ category }: { category: Category }) {
  const color = CATEGORY_META[category].color;
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: mixHex(color, '#000000', 0.62) }]} />
      <View style={{ position: 'absolute', width: 420, height: 420, borderRadius: 210, top: -190, left: -120, backgroundColor: mixHex(color, '#FFFFFF', 0.12), opacity: 0.5 }} />
      <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, top: -110, left: -50, backgroundColor: mixHex(color, '#FFFFFF', 0.2), opacity: 0.35 }} />
      <View style={{ position: 'absolute', left: '-20%', width: '140%', height: 64, top: '40%', transform: [{ rotate: '-12deg' }], backgroundColor: mixHex(color, '#FFFFFF', 0.25), opacity: 0.16 }} />
      <Grain opacity={0.55} />
    </>
  );
}

/**
 * Portada generada cuando no hay imagen libre: diseño propio, nunca una foto inventada del contenido. En grande es un
 * cartel (fondo teñido, la primera palabra del título enorme, el icono de la categoría y el rótulo «Portada generada»).
 * En miniatura, solo el icono.
 */
export function CategoryFallback({ category, title, style, compact }: { category: Category; title?: string; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[category];
  const icon = meta.icon as keyof typeof MaterialCommunityIcons.glyphMap;
  const word = (title ?? t(`categories.${category}`)).split(/\s+/)[0]?.replace(/[:,.]$/, '') ?? '';
  if (compact) {
    return (
      <View accessibilityRole="image" accessibilityLabel={t('item.imageFallback')} style={[{ backgroundColor: mixHex(meta.color, '#000000', 0.55), alignItems: 'center', justifyContent: 'center' }, style]}>
        <MaterialCommunityIcons name={icon} size={22} color={mixHex(meta.color, '#FFFFFF', 0.55)} />
      </View>
    );
  }
  return (
    <View accessibilityRole="image" accessibilityLabel={t('item.imageFallback')} style={[{ overflow: 'hidden' }, style]}>
      <PosterBackdrop category={category} />
      <View style={{ position: 'absolute', left: -6, right: -400, bottom: -28 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text
          numberOfLines={1}
          ellipsizeMode="clip"
          allowFontScaling={false}
          style={{ color: mixHex(meta.color, '#FFFFFF', 0.6), opacity: 0.32, fontFamily: fonts.displayHeavy, fontSize: 150, lineHeight: 150, letterSpacing: -7 }}
        >
          {word}
        </Text>
      </View>
      <MaterialCommunityIcons name={icon} size={84} color={mixHex(meta.color, '#FFFFFF', 0.7)} style={{ position: 'absolute', right: 20, top: 58, opacity: 0.85 }} />
      <Text style={{ position: 'absolute', left: 14, bottom: 10, color: onImage.muted, fontSize: 11 }}>{t('item.generatedCover')}</Text>
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
  title,
}: {
  image: CatalogImageModel;
  category: Category;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  contentFit?: 'cover' | 'contain';
  /** Para la portada generada: su primera palabra hace de cartel. */
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (image.isFallback || failed) return <CategoryFallback category={category} title={title} style={style} compact={compact} />;
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

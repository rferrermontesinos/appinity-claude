import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type Category } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type, usePalette, useThemeMode } from '../theme';
import { Grain, mixHex, onPoster } from './Aura';

/**
 * «Mundo» de una categoría: tintes derivados de su color para que las pantallas de detalle sigan siendo de esa
 * categoría (fondo, superficies, borde, puesto destacado). El tinte es leve (6–12 %): el texto conserva el contraste AA
 * de la paleta (calculado en el peor caso, Cultura).
 */
export function useCategoryWorld(category: Category) {
  const c = usePalette();
  const dark = useThemeMode((s) => s.mode) === 'dark';
  const color = CATEGORY_META[category].color;
  return {
    color,
    background: mixHex(c.background, color, dark ? 0.07 : 0.05),
    surface: mixHex(c.surface, color, dark ? 0.08 : 0.04),
    surfaceRaised: mixHex(c.surfaceRaised, color, dark ? 0.12 : 0.07),
    border: mixHex(c.background, color, dark ? 0.35 : 0.3),
    /** Puesto destacado y acentos de texto grande: el color aclarado (en oscuro) u oscurecido (en claro). */
    ink: dark ? mixHex(color, '#FFFFFF', 0.45) : mixHex(color, '#000000', 0.35),
    posterBase: mixHex(color, '#000000', 0.62),
  };
}

/**
 * Cabecera-cartel del detalle de categoría: el cartel de la cuadrícula «abierto» (mismo fondo, brillo, grano e icono
 * gigante), con el nombre en grande y qué recomienda. Fondo oscuro fijo en ambos temas; texto `onPoster`.
 */
export function CategoryPoster({ category }: { category: Category }) {
  const { t } = useTranslation();
  const world = useCategoryWorld(category);
  const meta = CATEGORY_META[category];
  const icon = meta.icon as keyof typeof MaterialCommunityIcons.glyphMap;
  const name = t(`categories.${category}`);
  const object = t(`categoryObject.${category}`);
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={`${name}. ${object !== name ? `${object}. ` : ''}${t(`scope.${meta.scope}`)}`}
      style={{ height: 196, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: world.posterBase, boxShadow: `0px 22px 48px -26px ${world.color}` }}
    >
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, top: -150, left: -90, backgroundColor: mixHex(world.color, '#FFFFFF', 0.15), opacity: 0.35 }} />
        <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, bottom: -120, right: 40, backgroundColor: world.color, opacity: 0.25 }} />
        <MaterialCommunityIcons name={icon} size={210} color={mixHex(world.color, '#FFFFFF', 0.5)} style={{ position: 'absolute', right: -36, bottom: -44, opacity: 0.2, transform: [{ rotate: '-8deg' }] }} />
        <Grain opacity={0.3} />
      </View>
      <View style={{ flex: 1, padding: spacing.lg + 2, justifyContent: 'space-between' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: onPoster.glass }}>
          <MaterialCommunityIcons name={icon} size={24} color={onPoster.text} />
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ color: onPoster.text, ...type.display }} numberOfLines={1} adjustsFontSizeToFit>
            {name}
          </Text>
          <Text style={{ color: onPoster.muted, fontSize: 14 }} numberOfLines={1}>
            {object !== name ? `${object} · ` : ''}
            {t(`scope.${meta.scope}`)}
          </Text>
        </View>
      </View>
    </View>
  );
}

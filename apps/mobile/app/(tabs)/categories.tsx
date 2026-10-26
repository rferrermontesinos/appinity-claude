import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORIES, CATEGORY_META, type Category } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Grain, mixHex, onPoster } from '../../src/components/Aura';
import { Body, Screen } from '../../src/components/ui';
import { fonts, radius, spacing } from '../../src/theme';

/**
 * Cartel de una categoría («Aura»): el mismo fondo que las portadas generadas (oscuro teñido, brillo, banda y grano),
 * icono, nombre en Bricolage y qué recomienda. El texto va en claro sobre la base oscura (AA calculado).
 */
function CategoryTile({ category, width }: { category: Category; width: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const meta = CATEGORY_META[category];
  const icon = meta.icon as keyof typeof MaterialCommunityIcons.glyphMap;
  const name = t(`categories.${category}`);
  const object = t(`categoryObject.${category}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${object !== name ? `${object}. ` : ''}${t(`scope.${meta.scope}`)}`}
      onPress={() => router.push({ pathname: '/category/[code]', params: { code: category } })}
      style={({ pressed }) => ({
        width,
        height: 168,
        borderRadius: radius.xl - 6,
        overflow: 'hidden',
        transform: [{ scale: pressed ? 0.97 : 1 }],
        boxShadow: `0px 16px 36px -22px ${meta.color}`,
      })}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: mixHex(meta.color, '#000000', 0.62) }]} />
      <View style={{ position: 'absolute', width: width * 0.9, height: width * 0.9, borderRadius: width, top: -width * 0.45, left: -width * 0.3, backgroundColor: mixHex(meta.color, '#FFFFFF', 0.15), opacity: 0.35 }} />
      <Grain opacity={0.3} />
      <MaterialCommunityIcons name={icon} size={120} color={mixHex(meta.color, '#FFFFFF', 0.5)} style={{ position: 'absolute', right: -22, bottom: -22, opacity: 0.22 }} />
      <View style={{ flex: 1, padding: spacing.md + 2, justifyContent: 'space-between' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,12,14,0.45)' }}>
          <MaterialCommunityIcons name={icon} size={22} color={onPoster.text} />
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ color: onPoster.text, fontFamily: fonts.displayHeavy, fontSize: 21, lineHeight: 24, letterSpacing: -0.5 }} numberOfLines={2}>
            {name}
          </Text>
          {/* El objeto solo se muestra si dice algo distinto del nombre («Música» → «Artistas»). */}
          <Text style={{ color: onPoster.muted, fontSize: 12 }} numberOfLines={1}>
            {object !== name ? object : t(`scope.${meta.scope}`).split(' · ')[0]}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Las ocho categorías del MVP como carteles en dos columnas. */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 640) - spacing.lg * 2 - spacing.md) / 2);
  return (
    <Screen>
      <Body muted>{t('categoriesScreen.subtitle')}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {CATEGORIES.map((category) => (
          <CategoryTile key={category} category={category} width={tile} />
        ))}
      </View>
    </Screen>
  );
}

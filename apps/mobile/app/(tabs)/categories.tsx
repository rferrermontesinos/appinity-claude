import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORIES, CATEGORY_META, type Category, type CategoryRankingDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useCategoryRanking } from '../../src/api/queries';
import { Grain, mixHex, onPoster } from '../../src/components/Aura';
import { Body, Screen, Small } from '../../src/components/ui';
import { fonts, radius, spacing } from '../../src/theme';

/**
 * Cartel de una categoría («Aura»): el mismo fondo que las portadas generadas (oscuro teñido, brillo, banda y grano),
 * icono, nombre en Bricolage y qué recomienda. El texto va en claro sobre la base oscura (AA calculado).
 */
type Rank = CategoryRankingDto['items'][number];

function CategoryTile({ category, width, rank }: { category: Category; width: number; rank?: Rank }) {
  const { t } = useTranslation();
  const router = useRouter();
  const meta = CATEGORY_META[category];
  const icon = meta.icon as keyof typeof MaterialCommunityIcons.glyphMap;
  const name = t(`categories.${category}`);
  const object = t(`categoryObject.${category}`);
  // Por qué está en esta posición: la afinidad con tus almas gemelas o, si no hay, cuánto te gusta.
  const why = rank?.affinity !== null && rank?.affinity !== undefined ? t('categoriesScreen.rankAffinity', { value: rank.affinity }) : rank?.likes ? t('categoriesScreen.rankLikes', { count: rank.likes }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${object !== name ? `${object}. ` : ''}${t(`scope.${meta.scope}`)}${why ? `. ${why}` : ''}`}
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
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: onPoster.glass }}>
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
          {why ? (
            <Text style={{ color: onPoster.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {why}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Las ocho categorías del MVP como carteles en dos columnas, en orden personal (2026-10-26): primero donde más
 * afinidad tienes con tus almas gemelas y más cosas te gustan. Mientras carga, o sin datos, el orden por defecto.
 */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const ranking = useCategoryRanking();
  const rankOf = new Map((ranking.data?.items ?? []).map((r) => [r.category, r]));
  const ordered = ranking.data ? ranking.data.items.map((r) => r.category) : [...CATEGORIES];
  const personal = (ranking.data?.items ?? []).some((r) => r.score > 0);
  const tile = Math.floor((Math.min(width, 640) - spacing.lg * 2 - spacing.md) / 2);
  return (
    <Screen>
      <Body muted>{t('categoriesScreen.subtitle')}</Body>
      {personal ? <Small>{t('categoriesScreen.orderHint')}</Small> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {ordered.map((category) => (
          <CategoryTile key={category} category={category} width={tile} rank={rankOf.get(category)} />
        ))}
      </View>
    </Screen>
  );
}

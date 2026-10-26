import { CATEGORY_META, isCategory, type Category } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { AuraBackdrop } from '../../src/components/Aura';
import { CategoryPoster, useCategoryWorld } from '../../src/components/CategoryWorld';
import { DataBanner } from '../../src/components/DataBanner';
import { ErrorCard, Loading, Small } from '../../src/components/ui';
import { RankedRow } from '../../src/components/WhyRecommended';
import { useRecommendationFeed } from '../../src/state/recommendationFeed';
import { spacing } from '../../src/theme';

/**
 * Una categoría (§3): el ranking de recomendaciones con el mismo motor que Inicio, sin los descartes de Inicio y con
 * paginación continua. Cada fila dice por qué está (motivo y cifras). Sin catálogo público: decisión del titular
 * (2026-10-26); la especificación no lo pide.
 */
export default function CategoryScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const category: Category = isCategory(code) ? code : 'movies';
  const { t } = useTranslation();
  const world = useCategoryWorld(category);
  const { width } = useWindowDimensions();
  const feed = useRecommendationFeed(category);
  const local = CATEGORY_META[category].scope === 'local';
  return (
    <View style={{ flex: 1, backgroundColor: world.background }}>
      {/* La barra superior se funde con el fondo teñido; el nombre grande ya está en el cartel. */}
      <Stack.Screen options={{ title: '', headerStyle: { backgroundColor: world.background }, headerShadowVisible: false }} />
      <AuraBackdrop color={world.color} width={width} style={{ position: 'absolute', top: 0, left: 0, width, height: 360 }} />
      <FlatList
        key={category}
        data={feed.items}
        keyExtractor={(r) => r.item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!feed.done) void feed.more();
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
            <CategoryPoster category={category} />
            <DataBanner />
            <Small>{t('categoriesScreen.recommendedIntro')}</Small>
            {feed.error ? <ErrorCard error={feed.error} onRetry={() => void feed.more()} /> : null}
          </View>
        }
        ListEmptyComponent={
          feed.loading ? (
            <Loading />
          ) : (
            <Small>{local && feed.meta?.localFilter === 'no_location' ? t('categoriesScreen.emptyNoLocation') : t('categoriesScreen.emptyRecommended')}</Small>
          )
        }
        ListFooterComponent={feed.loading && feed.items.length ? <Loading /> : null}
        renderItem={({ item, index }) => <RankedRow r={item} rank={index + 1} featured={index < 3} world={world} />}
      />
    </View>
  );
}

import { CATEGORY_META, isCategory, type Category } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';
import { DataBanner } from '../../src/components/DataBanner';
import { ErrorCard, Loading, Small } from '../../src/components/ui';
import { RankedRow } from '../../src/components/WhyRecommended';
import { useRecommendationFeed } from '../../src/state/recommendationFeed';
import { spacing, usePalette } from '../../src/theme';

/**
 * Una categoría (§3): el ranking de recomendaciones con el mismo motor que Inicio, sin los descartes de Inicio y con
 * paginación continua. Cada fila dice por qué está (motivo y cifras). Sin catálogo público: decisión del titular
 * (2026-10-26); la especificación no lo pide.
 */
export default function CategoryScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const category: Category = isCategory(code) ? code : 'movies';
  const { t } = useTranslation();
  const c = usePalette();
  const feed = useRecommendationFeed(category);
  const local = CATEGORY_META[category].scope === 'local';
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t(`categories.${category}`) }} />
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
          <View style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
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
        renderItem={({ item, index }) => <RankedRow r={item} rank={index + 1} featured={index < 3} />}
      />
    </View>
  );
}

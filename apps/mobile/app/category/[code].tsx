import { CATEGORY_META, isCategory, type Category } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { AuraBackdrop } from '../../src/components/Aura';
import { CategoryPoster, useCategoryWorld } from '../../src/components/CategoryWorld';
import { DataBanner } from '../../src/components/DataBanner';
import { DetailHeader } from '../../src/components/DetailHeader';
import { EmptyState, ErrorCard, Loading, Skeleton, Small } from '../../src/components/ui';
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
      {/* Cabecera única de detalle (DetailHeader): sin barra nativa, el fondo sigue sin cortes hasta arriba. */}
      <Stack.Screen options={{ headerShown: false, title: t(`categories.${category}`) }} />
      {/* A pantalla completa: el grano cubre todo el fondo (con altura fija se veía el corte entre zona granulada y lisa). */}
      <AuraBackdrop color={world.color} width={width} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <FlatList
        key={category}
        data={feed.items}
        keyExtractor={(r) => r.item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!feed.done) void feed.more();
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
            <DetailHeader fallback="/categories" />
            <CategoryPoster category={category} />
            <DataBanner />
            <Small>{t('categoriesScreen.recommendedIntro')}</Small>
            {feed.error ? <ErrorCard error={feed.error} onRetry={() => void feed.more()} /> : null}
          </View>
        }
        ListEmptyComponent={
          feed.loading ? (
            <Skeleton rows={4} height={88} />
          ) : (
            <EmptyState
              icon={local && feed.meta?.localFilter === 'no_location' ? 'map-marker-outline' : 'compass-outline'}
              title={t('categoriesScreen.emptyTitle')}
              body={local && feed.meta?.localFilter === 'no_location' ? t('categoriesScreen.emptyNoLocation') : t('categoriesScreen.emptyRecommended')}
            />
          )
        }
        ListFooterComponent={feed.loading && feed.items.length ? <Loading /> : null}
        renderItem={({ item, index }) => <RankedRow r={item} rank={index + 1} featured={index < 3} world={world} />}
      />
    </View>
  );
}

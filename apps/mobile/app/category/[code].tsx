import { CATEGORY_META, isCategory, type CatalogItemDto, type Category, type RecommendationDto } from '@appinity/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useCatalog } from '../../src/api/queries';
import { CatalogImage } from '../../src/components/CatalogImage';
import { reasonText } from '../../src/components/RecommendationCard';
import { useRecommendationFeed } from '../../src/state/recommendationFeed';
import { ErrorCard, Loading, Small } from '../../src/components/ui';
import { DataBanner } from '../../src/components/DataBanner';
import { radius, spacing, usePalette } from '../../src/theme';

function subtitle(item: CatalogItemDto): string | null {
  if (item.location) return item.location.locality ?? null;
  return item.releaseDate ? item.releaseDate.slice(0, 4) : null;
}

/** Selector «Recomendado» / «Catálogo» con el color propio de la categoría. */
function Tabs({ category, value, onChange }: { category: Category; value: 'recommended' | 'catalog'; onChange: (v: 'recommended' | 'catalog') => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const color = CATEGORY_META[category].color;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
      {(['recommended', 'catalog'] as const).map((tab) => (
        <Pressable
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab }}
          onPress={() => onChange(tab)}
          style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: color, backgroundColor: value === tab ? color : c.surface }}
        >
          <Text style={{ color: value === tab ? '#FFFFFF' : color, fontWeight: '700' }}>{t(`categoriesScreen.tab_${tab}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function RecommendationRow({ r }: { r: RecommendationDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${r.item.title}. ${reasonText(t, r)}`}
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: r.item.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.sm, opacity: pressed ? 0.8 : 1, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border })}
    >
      <CatalogImage image={r.item.primaryImage} category={r.item.category} compact style={{ width: 64, height: 64, borderRadius: radius.sm }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={2}>
          {r.item.title}
        </Text>
        <Small>{reasonText(t, r)}</Small>
      </View>
    </Pressable>
  );
}

/** Recomendaciones de la categoría (sin los descartes de Home) con paginación continua. */
function CategoryRecommendations({ category }: { category: Category }) {
  const { t } = useTranslation();
  const feed = useRecommendationFeed(category);
  const local = CATEGORY_META[category].scope === 'local';
  return (
    <FlatList
      data={feed.items}
      keyExtractor={(r) => r.item.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (!feed.done) void feed.more();
      }}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
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
      renderItem={({ item }) => <RecommendationRow r={item} />}
    />
  );
}

/** Una categoría: recomendaciones (por defecto) o el catálogo completo. */
export default function CategoryScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const category: Category = isCategory(code) ? code : 'movies';
  const { t } = useTranslation();
  const c = usePalette();
  const [tab, setTab] = useState<'recommended' | 'catalog'>('recommended');
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t(`categories.${category}`) }} />
      <Tabs category={category} value={tab} onChange={setTab} />
      {tab === 'recommended' ? <CategoryRecommendations key={category} category={category} /> : <CategoryCatalog category={category} />}
    </View>
  );
}

/** Catálogo de una categoría (no son recomendaciones). Incluye objetos sin imagen para ver el fallback. */
function CategoryCatalog({ category }: { category: Category }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const catalog = useCatalog(category);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={catalog.data?.items ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        columnWrapperStyle={{ gap: spacing.md }}
        refreshing={catalog.isRefetching}
        onRefresh={() => void catalog.refetch()}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <DataBanner />
            <Small style={{ fontWeight: '700' }}>
              {t('categoriesScreen.catalogNotRecommendations')}
              {catalog.data ? ` · ${t('categoriesScreen.itemCount', { count: catalog.data.total })}` : ''}
            </Small>
            {catalog.isLoading ? <Loading /> : null}
            {catalog.isError ? <ErrorCard error={catalog.error} onRetry={() => void catalog.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={catalog.isSuccess ? <Small>{t('categoriesScreen.empty')}</Small> : null}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            style={({ pressed }) => ({
              flex: 1,
              // Con un número impar de objetos, el último no ocupa toda la fila.
              maxWidth: '48.5%',
              opacity: pressed ? 0.8 : 1,
              backgroundColor: c.surface,
              borderRadius: radius.md,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: c.border,
            })}
          >
            <CatalogImage image={item.primaryImage} category={item.category} style={{ width: '100%', aspectRatio: 2 / 3 }} />
            <View style={{ padding: spacing.sm, gap: 2 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                {item.title}
              </Text>
              {subtitle(item) ? <Small>{subtitle(item)}</Small> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

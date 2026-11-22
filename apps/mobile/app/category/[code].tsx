import { isCategory, type CatalogItemDto, type Category } from '@appinity/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useCatalog } from '../../src/api/queries';
import { CatalogImage } from '../../src/components/CatalogImage';
import { ErrorCard, Loading, Small } from '../../src/components/ui';
import { DataBanner } from '../../src/components/DataBanner';
import { radius, spacing, usePalette } from '../../src/theme';

function subtitle(item: CatalogItemDto): string | null {
  if (item.location) return item.location.locality ?? null;
  return item.releaseDate ? item.releaseDate.slice(0, 4) : null;
}

/** Catálogo de una categoría (no son recomendaciones). Incluye objetos sin imagen para ver el fallback. */
export default function CategoryCatalogScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const category: Category = isCategory(code) ? code : 'movies';
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const catalog = useCatalog(category);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t(`categories.${category}`) }} />
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

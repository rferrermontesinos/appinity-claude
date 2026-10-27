import { CATEGORY_META, isCategory, type Category, type RecommendationDto } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { AuraBackdrop } from '../../src/components/Aura';
import { CategoryPoster, useCategoryWorld } from '../../src/components/CategoryWorld';
import { DataBanner } from '../../src/components/DataBanner';
import { DetailHeader } from '../../src/components/DetailHeader';
import { Button, EmptyState, ErrorCard, Loading, Skeleton, Small } from '../../src/components/ui';
import { RankedRow } from '../../src/components/WhyRecommended';
import { useRecommendationFeed } from '../../src/state/recommendationFeed';
import { fonts, spacing, usePalette } from '../../src/theme';

/**
 * Filas de la lista: las recomendaciones con datos (almas gemelas, seguidos, Trending, por contenido o de la
 * comunidad) y, aparte, «para explorar» (sin datos de nadie todavía). Cada apartado lleva su cabecera.
 */
type Section = 'data' | 'explore';
type Row = { kind: 'header'; section: Section } | { kind: 'item'; r: RecommendationDto; rank: number };

const sectionOf = (r: RecommendationDto): Section => (r.block === 'explore' ? 'explore' : 'data');
const SECTION_TEXT = {
  data: ['categoriesScreen.sectionData', 'categoriesScreen.sectionDataHint'],
  explore: ['categoriesScreen.sectionExplore', 'categoriesScreen.sectionExploreHint'],
} as const;

function toRows(items: RecommendationDto[]): Row[] {
  const rows: Row[] = [];
  let current: Section | null = null;
  let ranked = 0;
  for (const r of items) {
    const section = sectionOf(r);
    if (section !== current) {
      rows.push({ kind: 'header', section });
      current = section;
    }
    rows.push({ kind: 'item', r, rank: ++ranked });
  }
  return rows;
}

function SectionHeader({ section }: { section: Section }) {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={{ gap: 2, marginTop: spacing.md }}>
      <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontSize: 18 }}>
        {t(SECTION_TEXT[section][0])}
      </Text>
      <Small>{t(SECTION_TEXT[section][1])}</Small>
    </View>
  );
}

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
        data={toRows(feed.items)}
        keyExtractor={(row) => (row.kind === 'header' ? `header-${row.section}` : row.r.item.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
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
        ListFooterComponent={
          feed.items.length ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' }}>
              {feed.expanding ? <Small style={{ textAlign: 'center' }}>{t('categoriesScreen.expanding')}</Small> : null}
              {feed.loading ? <Loading /> : null}
              {!feed.loading && feed.pending ? <Small style={{ textAlign: 'center' }}>{t('categoriesScreen.expandPending')}</Small> : null}
              {!feed.loading && feed.done ? <Small style={{ textAlign: 'center' }}>{t(local ? 'categoriesScreen.endLocal' : 'categoriesScreen.endCatalog')}</Small> : null}
              {!feed.loading && !feed.done ? <Button label={t('categoriesScreen.loadMore')} icon="chevron-down" variant="secondary" onPress={() => void feed.more()} /> : null}
            </View>
          ) : null
        }
        renderItem={({ item: row }) =>
          row.kind === 'header' ? <SectionHeader section={row.section} /> : <RankedRow r={row.r} rank={row.rank} featured={row.rank <= 3 && sectionOf(row.r) === 'data'} world={world} />
        }
      />
    </View>
  );
}

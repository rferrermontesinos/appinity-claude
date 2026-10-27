import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type Category, type ObservationDto } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useItemProfileDetail } from '../../src/api/queries';
import { useCategoryWorld } from '../../src/components/CategoryWorld';
import { CatalogImage } from '../../src/components/CatalogImage';
import { Dimensions, formatPreference } from '../../src/components/Dimensions';
import { SourceLinks, openExternal } from '../../src/components/SourceLinks';
import { Badge, Body, Card, ErrorCard, Row, Screen, Skeleton, Small, Title } from '../../src/components/ui';
import { DataBanner } from '../../src/components/DataBanner';
import { DetailHeader } from '../../src/components/DetailHeader';
import { ItemCircle } from '../../src/components/ItemCircle';
import { ItemOpinion } from '../../src/components/ItemOpinion';
import { radius, spacing, type, usePalette } from '../../src/theme';

/** Enlace de texto (atribución de la imagen). */
function LinkText({ label, url }: { label: string; url: string }) {
  const c = usePalette();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => openExternal(url)} hitSlop={8}>
      <Text style={{ color: c.primaryInk, fontSize: 12, fontWeight: '600' }}>{label} ↗</Text>
    </Pressable>
  );
}

function sourceLabel(t: TFunction, key: string) {
  return t(`sources.names.${key}`, { defaultValue: key });
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : []);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Nombre del país en el idioma de la app (código ISO si el motor JS no tiene Intl.DisplayNames). */
function countryName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

type Summary = { text: string; url: string };
/** Sinopsis de Wikipedia en el idioma de la app; en español, si no hay artículo, la inglesa (avisando). */
function pickSummary(metadata: Record<string, unknown> | undefined, language: string): (Summary & { lang: string }) | null {
  const all = (metadata?.summary ?? {}) as Partial<Record<string, Summary>>;
  for (const lang of language.startsWith('es') ? ['es', 'en'] : ['en']) {
    const s = all[lang];
    if (s && typeof s.text === 'string' && typeof s.url === 'string') return { ...s, lang };
  }
  return null;
}

/** Carteles verticales (cine, series, libros); el resto, cuadrado (portadas de disco, logos, fotos de lugares). */
const TALL: readonly Category[] = ['movies', 'series', 'books'];

function EvidenceRow({ o }: { o: ObservationDto }) {
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const date = o.occurredAt
    ? o.timestampPrecision === 'year'
      ? o.occurredAt.slice(0, 4)
      : o.timestampPrecision === 'day'
        ? o.occurredAt.slice(0, 10)
        : new Date(o.occurredAt).toLocaleString(i18n.language)
    : t('common.unknownDate');
  const engagement = o.engagement
    ? `${o.engagement.type}${o.engagement.value !== undefined ? ` ${o.engagement.value}` : ''}${o.engagement.unit ? ` (${o.engagement.unit})` : ''}`
    : null;
  const meta = o.metadata as {
    track?: string;
    inference?: string;
    edition?: { isbn13?: string };
    resolvedVia?: { method?: string };
  };
  return (
    <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, padding: spacing.md, gap: 4 }}>
      <Text style={{ color: c.text, fontWeight: '700' }}>
        {t('item.evidenceFrom', { source: sourceLabel(t, o.sourceKey), kind: o.observationKind })}
      </Text>
      <Small>
        {t('dimensions.known')} {o.knownConfidence.toFixed(2)} · {t('dimensions.consumed')} {o.consumedConfidence.toFixed(2)} ·{' '}
        {t('dimensions.preference')} {formatPreference(o.preferenceScore)}
        {o.preferenceBasis ? ` (${t(`basis.${o.preferenceBasis}`)}, ${o.preferenceConfidence?.toFixed(2)})` : ''}
      </Small>
      {engagement ? <Small>{engagement}</Small> : null}
      {meta.track ? <Small>♪ {meta.track}</Small> : null}
      {meta.edition?.isbn13 ? <Small>{t('item.edition', { isbn: meta.edition.isbn13 })}</Small> : null}
      {meta.inference ? <Small>{meta.inference}</Small> : null}
      <Small>
        {t('item.occurred')}: {date}
        {o.timestampPrecision ? ` · ${t('item.precision', { value: o.timestampPrecision })}` : ''}
      </Small>
      <Small>
        {t('item.synced')}: {new Date(o.syncedAt).toLocaleString(i18n.language)} · {t('item.mapper')}: {o.mapperVersion}
        {meta.resolvedVia?.method ? ` · ${t('item.resolvedVia')}: ${meta.resolvedVia.method}` : ''}
      </Small>
    </View>
  );
}

/** Título de sección (paso h4 de la escala, como encabezado). */
function SectionTitle({ children }: { children: string }) {
  return <Title>{children}</Title>;
}

/**
 * Ficha de un objeto («Aura», rediseño 2026-10-27). La tarjeta de Inicio ya enseña el cartel grande; la ficha cuenta lo
 * que la tarjeta no dice:
 * 1. Cabecera compacta: miniatura con el brillo de su categoría + categoría, título y autoría/año (o la localidad).
 * 2. «Entre tus almas gemelas»: cuántas de tus 50 más afines la han valorado y cómo, y a quién de los que sigues le gusta.
 * 3. «Tu opinión»: votar con la misma escala que Inicio.
 * 4. «Sobre esto»: sinopsis (3–4 frases de Wikipedia, con atribución; si no hay, la descripción corta), todos los
 *    géneros, fecha, país, evento.
 * 5. «Dónde encontrarlo», tu relación (Known, Consumed y Preference por separado) y, plegados, los datos técnicos.
 */
export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const detail = useItemProfileDetail(id);
  const item = detail.data?.item;
  const notes = detail.data?.notes;
  const world = useCategoryWorld(item?.category ?? 'movies');
  const [technical, setTechnical] = useState(false);
  const image = item?.primaryImage;

  // Lugares: la localidad va en la cabecera; obras: autoría y año.
  const placeLike = item?.category === 'food' || item?.category === 'culture';
  const creators = strings(item?.metadata.creators);
  const genres = strings(item?.metadata.genres);
  const countries = strings(item?.metadata.countriesOfOrigin);
  const year = item?.releaseDate?.slice(0, 4);
  const subtitle = item ? (placeLike ? (item.location?.locality ?? null) : [creators.join(', '), year].filter(Boolean).join(' · ') || null) : null;
  const tall = item ? TALL.includes(item.category) : false;
  const meta = item ? CATEGORY_META[item.category] : null;
  const summary = pickSummary(item?.metadata, i18n.language);

  return (
    <Screen refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} background={item ? world.background : undefined}>
      {/* Cabecera única de detalle; el fondo es el «mundo» de su categoría. */}
      <Stack.Screen options={{ headerShown: false, title: item?.title ?? t('item.title') }} />
      <DetailHeader />
      {detail.isLoading ? <Skeleton rows={3} height={140} /> : null}
      {detail.isError ? <ErrorCard error={detail.error} onRetry={() => void detail.refetch()} /> : null}
      {item && image && meta ? (
        <>
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-end' }}>
              <View
                style={{
                  width: 112,
                  aspectRatio: tall ? 2 / 3 : 1,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  backgroundColor: c.surfaceAlt,
                  borderWidth: 1,
                  borderColor: world.border,
                  boxShadow: `0px 16px 32px -18px ${world.color}`,
                }}
              >
                <CatalogImage image={image} category={item.category} title={item.title} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              </View>
              <View style={{ flex: 1, gap: spacing.xs, paddingBottom: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <MaterialCommunityIcons name={meta.icon as never} size={16} color={meta.color} />
                  <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>{t(`categories.${item.category}`)}</Text>
                </View>
                <Text accessibilityRole="header" style={{ color: c.text, ...type.h2 }} numberOfLines={4}>
                  {item.title}
                </Text>
                {subtitle ? (
                  <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 19 }} numberOfLines={3}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* Atribución exigida por la licencia de la foto, visible bajo la cabecera. */}
            {image.isFallback ? (
              <Small>{t('item.generatedCover')}</Small>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm }}>
                <Small>
                  {t('item.photo')}: {[image.author, image.license].filter(Boolean).join(' · ')}
                </Small>
                {image.descriptionUrl ? <LinkText label={t('item.imageSource')} url={image.descriptionUrl} /> : null}
              </View>
            )}
          </View>

          <ItemCircle itemId={item.id} surface={world.surface} />
          <ItemOpinion itemId={item.id} surface={world.surface} />

          {summary || item.description || genres.length || countries.length || item.releaseDate || item.eventStartsAt || (item.location?.locality && !placeLike) ? (
            <Card style={{ backgroundColor: world.surface }}>
              <SectionTitle>{t('item.about')}</SectionTitle>
              {summary ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{summary.text}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xs }}>
                    <Small>{`${t('item.textSource')}:`}</Small>
                    <LinkText label={`Wikipedia · CC BY-SA 4.0${summary.lang !== i18n.language.slice(0, 2) ? ` · ${t('item.inEnglish')}` : ''}`} url={summary.url} />
                  </View>
                </View>
              ) : item.description ? (
                <Body muted>{capitalize(item.description)}</Body>
              ) : null}
              {genres.length ? (
                <View accessibilityLabel={`${t('item.genres')}: ${genres.join(', ')}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {genres.map((g) => (
                    <Badge key={g} label={capitalize(g)} color={c.text} background={c.surfaceAlt} />
                  ))}
                </View>
              ) : null}
              {item.releaseDate ? (
                <Row label={t('item.released')} value={`${item.releaseDate} (${t(`item.releasedPrecision.${item.releaseDatePrecision ?? 'day'}`)})`} />
              ) : null}
              {item.eventStartsAt ? <Row label={t('item.event')} value={`${item.eventStartsAt}${item.eventEndsAt ? ` → ${item.eventEndsAt}` : ''}`} /> : null}
              {countries.length ? <Row label={t('item.country')} value={countries.map((code) => countryName(code, i18n.language)).join(', ')} /> : null}
              {item.location?.locality && !placeLike ? <Row label={t('item.location')} value={item.location.locality} /> : null}
            </Card>
          ) : null}

          {item.externalLinks.length ? (
            <View style={{ gap: spacing.sm }}>
              <Text accessibilityRole="header" style={{ color: c.text, ...type.h3 }}>
                {t('item.whereToFind')}
              </Text>
              <SourceLinks links={item.externalLinks} accent={world.border} />
            </View>
          ) : null}

          <Card style={{ backgroundColor: world.surface }}>
            <SectionTitle>{t('item.yourRelation')}</SectionTitle>
            <DataBanner />
            {detail.data?.profile ? (
              <>
                <Dimensions {...detail.data.profile} />
                {notes?.overridden?.length ? (
                  <Small>
                    {t('item.overridden')}: {notes.overridden.map((o) => `${t(`basis.${o.basis}`)} ${formatPreference(o.score)}`).join(', ')}
                  </Small>
                ) : null}
                {notes?.disagreement?.length ? <Small style={{ color: c.warn }}>{t('item.disagreement')}</Small> : null}
                {notes?.supersededInSource ? <Small>{t('item.superseded', { count: notes.supersededInSource })}</Small> : null}
              </>
            ) : (
              <Body muted>{t('item.noProfile')}</Body>
            )}
          </Card>

          {/* Datos técnicos plegados: útiles para comprobar, no para decidir. */}
          <Card style={{ backgroundColor: world.surface }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: technical }}
              onPress={() => setTechnical((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}
            >
              <View style={{ flex: 1 }}>
                <SectionTitle>{t('item.technical')}</SectionTitle>
                <Small>{t('item.technicalHint')}</Small>
              </View>
              <MaterialCommunityIcons name={technical ? 'chevron-up' : 'chevron-down'} size={24} color={c.textMuted} />
            </Pressable>
            {technical ? (
              <>
                {detail.data?.observations.length ? (
                  <>
                    <Small style={{ fontWeight: '700' }}>{t('item.evidence')}</Small>
                    <Small>{t('item.simulatedActivity')}</Small>
                    {detail.data.observations.map((o) => (
                      <EvidenceRow key={o.id} o={o} />
                    ))}
                  </>
                ) : null}
                <Small style={{ fontWeight: '700', marginTop: spacing.sm }}>{t('item.externalIds')}</Small>
                {item.externalIds.map((e) => (
                  <Row key={`${e.provider}:${e.idType}`} label={`${e.provider}:${e.idType}`} value={e.value} />
                ))}
              </>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

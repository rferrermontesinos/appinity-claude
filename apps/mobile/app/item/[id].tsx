import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ObservationDto } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useItemProfileDetail } from '../../src/api/queries';
import { contextLine } from '../../src/catalog/contextLine';
import { useCategoryWorld } from '../../src/components/CategoryWorld';
import { CatalogImage } from '../../src/components/CatalogImage';
import { CategoryChipOnImage, ImageVeil } from '../../src/components/ImageVeil';
import { Dimensions, formatPreference } from '../../src/components/Dimensions';
import { SourceLinks, openExternal } from '../../src/components/SourceLinks';
import { Body, Card, ErrorCard, Loading, Row, Screen, Skeleton, Small, Title } from '../../src/components/ui';
import { DataBanner } from '../../src/components/DataBanner';
import { DetailHeader } from '../../src/components/DetailHeader';
import { onImage, radius, spacing, type, usePalette } from '../../src/theme';

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
 * Ficha de un objeto («Aura»): cartel a sangre con su categoría, título y contexto; atribución de la foto; «Dónde
 * encontrarlo» (Spotify, Steam, Google Maps… según la categoría, §2); descripción; tu relación con él (Known, Consumed y
 * Preference por separado) y, plegados, los datos técnicos (IDs externos y evidencias propias). Todo en el «mundo» de
 * su categoría.
 */
export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = usePalette();
  const detail = useItemProfileDetail(id);
  const item = detail.data?.item;
  const notes = detail.data?.notes;
  const world = useCategoryWorld(item?.category ?? 'movies');
  const [technical, setTechnical] = useState(false);
  const context = item ? contextLine(item) : null;
  const image = item?.primaryImage;

  return (
    <Screen refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} background={item ? world.background : undefined}>
      {/* Cabecera única de detalle: el título ya está en el cartel; el fondo es el «mundo» de su categoría. */}
      <Stack.Screen options={{ headerShown: false, title: item?.title ?? t('item.title') }} />
      <DetailHeader />
      {detail.isLoading ? <Skeleton rows={3} height={140} /> : null}
      {detail.isError ? <ErrorCard error={detail.error} onRetry={() => void detail.refetch()} /> : null}
      {item && image ? (
        <>
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                width: '100%',
                aspectRatio: 0.9,
                borderRadius: radius.xl,
                overflow: 'hidden',
                backgroundColor: c.surfaceAlt,
                borderWidth: 1,
                borderColor: world.border,
                boxShadow: `0px 22px 48px -26px ${world.color}`,
              }}
            >
              <CatalogImage image={image} category={item.category} title={item.title} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              <ImageVeil height="55%" />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.sm }}>
                <CategoryChipOnImage category={item.category} />
                <Text accessibilityRole="header" style={{ color: onImage.text, ...type.h1 }} numberOfLines={3}>
                  {item.title}
                </Text>
                {context ? (
                  <Text style={{ color: onImage.muted, fontSize: 14 }} numberOfLines={2}>
                    {context}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* Atribución exigida por la licencia de la foto, visible bajo el cartel. */}
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

          {item.externalLinks.length ? (
            <View style={{ gap: spacing.sm }}>
              <Text accessibilityRole="header" style={{ color: c.text, ...type.h3 }}>
                {t('item.whereToFind')}
              </Text>
              <SourceLinks links={item.externalLinks} accent={world.border} />
            </View>
          ) : null}

          {item.description || item.releaseDate || item.eventStartsAt || item.location?.locality ? (
            <Card style={{ backgroundColor: world.surface }}>
              <SectionTitle>{t('item.about')}</SectionTitle>
              {item.description ? <Body muted>{item.description}</Body> : null}
              {item.releaseDate ? (
                <Row label={t('item.released')} value={`${item.releaseDate} (${t(`item.releasedPrecision.${item.releaseDatePrecision ?? 'day'}`)})`} />
              ) : null}
              {item.eventStartsAt ? <Row label={t('item.event')} value={`${item.eventStartsAt}${item.eventEndsAt ? ` → ${item.eventEndsAt}` : ''}`} /> : null}
              {item.location?.locality ? <Row label={t('item.location')} value={item.location.locality} /> : null}
            </Card>
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

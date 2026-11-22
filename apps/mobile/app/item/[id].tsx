import { CATEGORY_META, type ObservationDto } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useItemProfileDetail } from '../../src/api/queries';
import { CatalogImage } from '../../src/components/CatalogImage';
import { Dimensions, formatPreference } from '../../src/components/Dimensions';
import { Badge, Body, Card, ErrorCard, Loading, Row, Screen, Small, Title } from '../../src/components/ui';
import { DataBanner } from '../../src/components/DataBanner';
import { radius, spacing, usePalette } from '../../src/theme';

/** Abre enlaces externos solo si son https (validación de enlaces). */
function openExternal(url: string) {
  if (url.startsWith('https://')) void WebBrowser.openBrowserAsync(url);
}

function LinkText({ label, url }: { label: string; url: string }) {
  const c = usePalette();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => openExternal(url)}>
      <Text style={{ color: c.accent, fontSize: 14, paddingVertical: 2 }}>{label} ↗</Text>
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

/** Detalle de un objeto: imagen con atribución, metadatos, IDs externos, perfil propio y evidencias propias. */
export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = usePalette();
  const detail = useItemProfileDetail(id);
  const item = detail.data?.item;
  const notes = detail.data?.notes;

  return (
    <Screen refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()}>
      <Stack.Screen options={{ title: item?.title ?? t('item.title') }} />
      {detail.isLoading ? <Loading /> : null}
      {detail.isError ? <ErrorCard error={detail.error} onRetry={() => void detail.refetch()} /> : null}
      {item ? (
        <>
          <CatalogImage
            image={item.primaryImage}
            category={item.category}
            contentFit="contain"
            style={{ width: '100%', height: 320, borderRadius: radius.md, backgroundColor: c.surfaceAlt }}
          />
          <Card>
            <Title>{item.title}</Title>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Badge label={t(`categories.${item.category}`)} color={CATEGORY_META[item.category].color} />
              <Badge label={item.itemType} color={c.textMuted} />
            </View>
            {item.description ? <Body muted>{item.description}</Body> : null}
            {item.releaseDate ? (
              <Row
                label={t('item.released')}
                value={`${item.releaseDate} (${t(`item.releasedPrecision.${item.releaseDatePrecision ?? 'day'}`)})`}
              />
            ) : null}
            {item.eventStartsAt ? (
              <Row label={t('item.event')} value={`${item.eventStartsAt}${item.eventEndsAt ? ` → ${item.eventEndsAt}` : ''}`} />
            ) : null}
            {item.location ? (
              <Row
                label={t('item.location')}
                value={`${item.location.locality ?? ''} · ${item.location.latitude.toFixed(3)}, ${item.location.longitude.toFixed(3)}`}
              />
            ) : null}
          </Card>

          <Card>
            <Title style={{ fontSize: 15 }}>{t('item.image')}</Title>
            {item.primaryImage.isFallback ? (
              <Small>{t('item.imageFallback')}</Small>
            ) : (
              <>
                {item.primaryImage.author ? <Row label={t('item.imageAuthor')} value={item.primaryImage.author} /> : null}
                {item.primaryImage.license ? <Row label={t('item.imageLicense')} value={item.primaryImage.license} /> : null}
                {item.primaryImage.descriptionUrl ? (
                  <LinkText label={t('item.imageSource')} url={item.primaryImage.descriptionUrl} />
                ) : null}
              </>
            )}
          </Card>

          <Card>
            <Title style={{ fontSize: 15 }}>{t('item.profile')}</Title>
            <DataBanner />
            {detail.data?.profile ? (
              <>
                <Dimensions {...detail.data.profile} />
                {notes?.overridden?.length ? (
                  <Small>
                    {t('item.overridden')}:{' '}
                    {notes.overridden.map((o) => `${t(`basis.${o.basis}`)} ${formatPreference(o.score)}`).join(', ')}
                  </Small>
                ) : null}
                {notes?.disagreement?.length ? <Small style={{ color: c.warn }}>{t('item.disagreement')}</Small> : null}
                {notes?.supersededInSource ? <Small>{t('item.superseded', { count: notes.supersededInSource })}</Small> : null}
              </>
            ) : (
              <Body muted>{t('item.noProfile')}</Body>
            )}
          </Card>

          {detail.data?.observations.length ? (
            <Card>
              <Title style={{ fontSize: 15 }}>{t('item.evidence')}</Title>
              <Small>{t('item.simulatedActivity')}</Small>
              {detail.data.observations.map((o) => (
                <EvidenceRow key={o.id} o={o} />
              ))}
            </Card>
          ) : null}

          <Card>
            <Title style={{ fontSize: 15 }}>{t('item.externalIds')}</Title>
            {item.externalIds.map((e) => (
              <Row key={`${e.provider}:${e.idType}`} label={`${e.provider}:${e.idType}`} value={e.value} />
            ))}
            {item.externalLinks.length ? <Small style={{ fontWeight: '700', marginTop: spacing.sm }}>{t('item.links')}</Small> : null}
            {item.externalLinks.map((l) => (
              <LinkText key={l.url} label={l.provider} url={l.url} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

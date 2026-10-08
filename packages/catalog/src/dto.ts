import type { catalogExternalIds, catalogImages, catalogItems } from '@appinity/database';
import type { CatalogImageDto, CatalogItemDto, DatePrecision } from '@appinity/shared';
import { fallbackImage } from './fallback.js';

type ItemRow = typeof catalogItems.$inferSelect;
type ImageRow = typeof catalogImages.$inferSelect;
type ExternalIdRow = Pick<typeof catalogExternalIds.$inferSelect, 'provider' | 'idType' | 'externalId'>;

/** Fecha con su precisión real: "1942" si solo se conoce el año, "1942-11" con el mes, día completo si existe. */
export function formatPartialDate(date: string | null, precision: DatePrecision | null): string | null {
  if (!date || !precision) return null;
  if (precision === 'year') return date.slice(0, 4);
  if (precision === 'month') return date.slice(0, 7);
  return date.slice(0, 10);
}

export function formatEventDate(value: Date | null, precision: 'day' | 'instant' | null): string | null {
  if (!value) return null;
  return precision === 'instant' ? value.toISOString() : value.toISOString().slice(0, 10);
}

/** Nombre visible de cada origen de imagen en la atribución. */
const SOURCE_LABELS: Record<string, string> = { wikimedia_commons: 'Wikimedia Commons', steam_cdn: 'Steam', tmdb: 'TMDB' };

/** Texto de atribución exigido por la licencia de la imagen. */
export function imageAttribution(image: Pick<ImageRow, 'author' | 'license' | 'source'>): string | undefined {
  const sourceLabel = SOURCE_LABELS[image.source] ?? image.source;
  const parts = [image.author, image.license, sourceLabel]
    .filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(' · ') : undefined;
}

export function toImageDto(image: ImageRow, baseUrl: string): CatalogImageDto {
  const cached = image.cacheStatus === 'cached' && image.storageKey;
  return {
    url: cached ? `${baseUrl}/media/${image.storageKey}` : image.url,
    ...(cached ? { storageKey: image.storageKey! } : {}),
    source: image.source,
    ...(image.sourceImageId ? { sourceImageId: image.sourceImageId } : {}),
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
    alt: image.alt,
    ...(imageAttribution(image) ? { attribution: imageAttribution(image)! } : {}),
    ...(image.licenseUrl || image.descriptionUrl ? { rightsOrPolicyReference: (image.licenseUrl ?? image.descriptionUrl)! } : {}),
    ...(image.fetchedAt ? { fetchedAt: image.fetchedAt.toISOString() } : {}),
    ...(image.expiresAt ? { expiresAt: image.expiresAt.toISOString() } : {}),
    isFallback: false,
    ...(image.license ? { license: image.license } : {}),
    ...(image.licenseUrl ? { licenseUrl: image.licenseUrl } : {}),
    ...(image.author ? { author: image.author } : {}),
    ...(image.descriptionUrl ? { descriptionUrl: image.descriptionUrl } : {}),
  };
}

/**
 * DTO del catálogo. La imagen es obligatoria: la propia, la del objeto padre (temporada → serie) o el fallback
 * de la categoría.
 */
export function toCatalogItemDto(
  item: ItemRow,
  image: ImageRow | null,
  externalIds: ExternalIdRow[],
  baseUrl: string,
  parentImage: ImageRow | null = null,
): CatalogItemDto {
  const chosen = image ?? parentImage;
  return {
    id: item.id,
    dataset: item.dataset,
    category: item.category,
    itemType: item.itemType,
    title: item.title,
    description: item.description,
    primaryImage: chosen ? toImageDto(chosen, baseUrl) : fallbackImage(item.category, baseUrl),
    externalIds: externalIds
      .map((e) => ({ provider: e.provider, idType: e.idType, value: e.externalId }))
      .sort((a, b) => `${a.provider}:${a.idType}`.localeCompare(`${b.provider}:${b.idType}`)),
    externalLinks: item.externalLinks,
    releaseDate: formatPartialDate(item.releaseDate, item.releaseDatePrecision),
    releaseDatePrecision: item.releaseDatePrecision,
    eventStartsAt: formatEventDate(item.eventStartsAt, item.eventDatePrecision),
    eventEndsAt: formatEventDate(item.eventEndsAt, item.eventDatePrecision),
    parentItemId: item.parentItemId,
    location:
      item.latitude !== null && item.longitude !== null
        ? { latitude: item.latitude, longitude: item.longitude, locality: item.locality, countryCode: item.countryCode }
        : null,
    metadata: item.metadata,
  };
}

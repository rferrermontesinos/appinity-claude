import { readFileSync } from 'node:fs';
import {
  CANONICAL_ID_KEYS,
  externalIdKey,
  type CatalogMatch,
  type CatalogProvider,
  type CatalogSearch,
  type Category,
  type DatePrecision,
  type ExternalIdRef,
  type ExternalItemCandidate,
  type ProviderCatalogItem,
  type ProviderImage,
} from '@appinity/shared';
import { normalizeTitle, yearOf, haversineMeters } from '../text.js';

/** Entrada de la instantánea generada por scripts/fixtures/build-catalog-snapshot.mjs. */
interface SnapshotEntry {
  key: string;
  category: Category;
  itemType: string;
  title: string;
  titles?: Record<string, string>;
  description?: string;
  externalIds: ExternalIdRef[];
  links: Array<{ provider: string; url: string }>;
  metadata: Record<string, unknown>;
  releaseDate?: string;
  releaseDatePrecision?: DatePrecision;
  eventStartsAt?: { date: string; precision: DatePrecision };
  eventEndsAt?: { date: string; precision: DatePrecision };
  location?: { latitude: number; longitude: number; locality?: string; countryCode?: string };
  parentKey?: string;
  image: (Omit<ProviderImage, 'alt'> & { wikidataProperty?: string }) | null;
  imageNote?: string;
}

interface Snapshot {
  snapshotVersion: number;
  source: string;
  retrievedAt: string;
  items: SnapshotEntry[];
}

export const WIKIDATA_SNAPSHOT_PROVIDER_KEY = 'wikidata_snapshot';

const DEFAULT_PATH = new URL('../../data/wikidata-snapshot.json', import.meta.url);

/** Confianza documentada por método de resolución (propuesta, ver docs/decisions.md). */
export const RESOLUTION_CONFIDENCE = {
  canonicalId: 1,
  providerId: 0.98,
  attributes: 0.9,
} as const;

/**
 * Proveedor de catálogo respaldado por una instantánea congelada de Wikidata + Wikimedia Commons. Los objetos,
 * metadatos e imágenes son reales; no hace llamadas de red en tiempo de ejecución.
 */
export class WikidataSnapshotProvider implements CatalogProvider {
  readonly key = WIKIDATA_SNAPSHOT_PROVIDER_KEY;
  readonly retrievedAt: string;
  private readonly entries: SnapshotEntry[];
  private readonly byKey = new Map<string, SnapshotEntry>();
  private readonly byExternalId = new Map<string, SnapshotEntry>();

  constructor(path: URL | string = DEFAULT_PATH) {
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
    this.retrievedAt = snapshot.retrievedAt;
    this.entries = snapshot.items;
    for (const entry of this.entries) {
      this.byKey.set(entry.key, entry);
      for (const ref of entry.externalIds) this.byExternalId.set(`${externalIdKey(ref)}:${ref.value}`, entry);
    }
  }

  /** Todos los objetos, con los padres antes que sus hijos (para importar en orden). */
  allItems(): ProviderCatalogItem[] {
    return this.entries
      .toSorted((a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)) || a.key.localeCompare(b.key))
      .map((e) => this.toItem(e));
  }

  async search(query: CatalogSearch): Promise<ProviderCatalogItem[]> {
    const needle = normalizeTitle(query.query);
    return this.entries
      .filter((e) => (!query.category || e.category === query.category) && this.titlesOf(e).some((t) => t.includes(needle)))
      .slice(0, query.limit ?? 20)
      .map((e) => this.toItem(e));
  }

  async getItem(externalId: string): Promise<ProviderCatalogItem> {
    const entry = this.byKey.get(externalId) ?? this.byExternalId.get(`wikidata:entity:${externalId}`);
    if (!entry) throw new Error(`Objeto desconocido en la instantánea: ${externalId}`);
    return this.toItem(entry);
  }

  async resolve(candidate: ExternalItemCandidate): Promise<CatalogMatch | null> {
    // 1) Identificadores: primero los canónicos (Wikidata, IMDb, MusicBrainz…), después los de proveedor.
    const refs = Object.entries(candidate.canonicalIds ?? {}).sort(([a], [b]) => idPriority(a) - idPriority(b));
    for (const [key, value] of refs) {
      const entry = this.byExternalId.get(`${key}:${value}`);
      if (entry && entry.category === candidate.category) {
        const canonical = (CANONICAL_ID_KEYS as readonly string[]).includes(key);
        return {
          item: this.toItem(entry),
          matchedBy: canonical ? 'canonical_id' : 'provider_id',
          confidence: canonical ? RESOLUTION_CONFIDENCE.canonicalId : RESOLUTION_CONFIDENCE.providerId,
        };
      }
    }
    // 2) Atributos: título normalizado exacto + categoría + tipo + (año o ubicación). Nunca solo el título.
    const title = normalizeTitle(candidate.title);
    const year = candidate.attributes?.releaseYear;
    const location = candidate.attributes?.location;
    if (year === undefined && !location) return null;
    const matches = this.entries.filter(
      (e) =>
        e.category === candidate.category &&
        e.itemType === candidate.itemType &&
        this.titlesOf(e).includes(title) &&
        (year === undefined || yearOf(e.releaseDate) === year) &&
        (!location || (e.location && haversineMeters(e.location, location) <= 150)) &&
        creatorsCompatible(e, candidate.attributes?.creators),
    );
    if (matches.length !== 1) return null;
    return { item: this.toItem(matches[0]!), matchedBy: 'attributes', confidence: RESOLUTION_CONFIDENCE.attributes };
  }

  private titlesOf(entry: SnapshotEntry): string[] {
    return [...new Set([entry.title, ...Object.values(entry.titles ?? {})].map(normalizeTitle))];
  }

  private toItem(entry: SnapshotEntry): ProviderCatalogItem {
    const toInstant = (d?: { date: string }) => (d ? `${d.date}T00:00:00.000Z` : undefined);
    return {
      id: entry.key,
      category: entry.category,
      itemType: entry.itemType,
      title: entry.title,
      ...(entry.description ? { description: entry.description } : {}),
      primaryImage: entry.image
        ? {
            url: entry.image.url,
            ...(entry.image.originalUrl ? { originalUrl: entry.image.originalUrl } : {}),
            source: entry.image.source,
            ...(entry.image.sourceImageId ? { sourceImageId: entry.image.sourceImageId } : {}),
            ...(entry.image.width ? { width: entry.image.width } : {}),
            ...(entry.image.height ? { height: entry.image.height } : {}),
            ...(entry.image.mime ? { mime: entry.image.mime } : {}),
            alt: entry.title,
            ...(entry.image.author ? { author: entry.image.author } : {}),
            ...(entry.image.license ? { license: entry.image.license } : {}),
            ...(entry.image.licenseUrl ? { licenseUrl: entry.image.licenseUrl } : {}),
            attributionRequired: Boolean(entry.image.attributionRequired),
            ...(entry.image.descriptionUrl ? { descriptionUrl: entry.image.descriptionUrl } : {}),
            ...(entry.image.restrictions ? { restrictions: entry.image.restrictions } : {}),
          }
        : null,
      externalIds: entry.externalIds,
      externalLinks: entry.links,
      ...(entry.releaseDate ? { releaseDate: entry.releaseDate, releaseDatePrecision: entry.releaseDatePrecision ?? 'day' } : {}),
      ...(entry.eventStartsAt ? { eventStartsAt: toInstant(entry.eventStartsAt), eventDatePrecision: 'day' as const } : {}),
      ...(entry.eventEndsAt ? { eventEndsAt: toInstant(entry.eventEndsAt) } : {}),
      ...(entry.parentKey ? { parentId: entry.parentKey } : {}),
      ...(entry.location
        ? {
            location: {
              latitude: entry.location.latitude,
              longitude: entry.location.longitude,
              ...(entry.location.locality ? { locality: entry.location.locality } : {}),
              ...(entry.location.countryCode ? { countryCode: entry.location.countryCode } : {}),
            },
          }
        : {}),
      metadata: {
        ...entry.metadata,
        ...(entry.titles && Object.keys(entry.titles).length ? { titles: entry.titles } : {}),
        ...(entry.imageNote ? { imageNote: entry.imageNote } : {}),
        catalogSource: { provider: WIKIDATA_SNAPSHOT_PROVIDER_KEY, key: entry.key, retrievedAt: this.retrievedAt },
      },
    };
  }
}

function idPriority(key: string): number {
  const index = (CANONICAL_ID_KEYS as readonly string[]).indexOf(key);
  return index === -1 ? 100 : index;
}

function creatorsCompatible(entry: SnapshotEntry, creators?: string[]): boolean {
  if (!creators?.length) return true;
  const known = ((entry.metadata.creators as string[] | undefined) ?? []).map(normalizeTitle);
  if (!known.length) return true;
  return creators.map(normalizeTitle).some((c) => known.some((k) => k.includes(c) || c.includes(k)));
}

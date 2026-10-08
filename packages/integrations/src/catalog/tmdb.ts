import {
  isSourceError,
  type CatalogMatch,
  type CatalogProvider,
  type CatalogSearch,
  type ExternalIdRef,
  type ExternalItemCandidate,
  type ProviderCatalogItem,
} from '@appinity/shared';
import { TmdbClient, type TmdbClientOptions } from '../tmdb/client.js';
import {
  TMDB_CACHE_MAX_DAYS,
  TMDB_IMAGE_BASE,
  TMDB_SITE_BASE,
  TMDB_TERMS_URL,
  type TmdbMedia,
} from '../tmdb/constants.js';
import type { TmdbDetails, TmdbListItem } from '../tmdb/schemas.js';

export const TMDB_CATALOG_PROVIDER_KEY = 'tmdb';

/** Confianza documentada (igual que el resto de proveedores): ID del propio proveedor 0,98; ID canónico (IMDb) 1. */
const CONFIDENCE = { providerId: 0.98, canonicalId: 1 } as const;
const DAY_MS = 86_400_000;

const MEDIA_BY_CATEGORY = { movies: 'movie', series: 'tv' } as const satisfies Record<string, TmdbMedia>;

function parseItemId(externalId: string): { media: TmdbMedia; id: number } | null {
  const match = /^(movie|tv):(\d+)$/.exec(externalId);
  return match ? { media: match[1] as TmdbMedia, id: Number(match[2]) } : null;
}

function dateOrUndefined(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/**
 * Ficha de TMDb → objeto de catálogo. Los IDs de película y de serie viven en espacios distintos (`tmdb:movie` y
 * `tmdb:tv`), y se añaden IMDb y Wikidata cuando TMDb los conoce para que otras fuentes encuentren el mismo objeto.
 * El póster es una referencia al CDN de TMDb con su atribución; el contenido caduca a los 180 días (condiciones §1.C).
 */
export function tmdbDetailsToCatalogItem(media: TmdbMedia, details: Partial<TmdbDetails> & { id: number }, now: Date): ProviderCatalogItem {
  const isMovie = media === 'movie';
  const title = (isMovie ? details.title ?? details.original_title : details.name ?? details.original_name) ?? `TMDb ${media}:${details.id}`;
  const releaseDate = dateOrUndefined(isMovie ? details.release_date : details.first_air_date);
  const externalIds: ExternalIdRef[] = [{ provider: 'tmdb', idType: media, value: String(details.id) }];
  const imdb = details.external_ids?.imdb_id;
  if (imdb && /^tt\d+$/.test(imdb)) externalIds.push({ provider: 'imdb', idType: 'title', value: imdb });
  const wikidata = details.external_ids?.wikidata_id;
  if (wikidata && /^Q\d+$/.test(wikidata)) externalIds.push({ provider: 'wikidata', idType: 'entity', value: wikidata });
  const pageUrl = `${TMDB_SITE_BASE}/${media}/${details.id}`;

  return {
    id: `${media}:${details.id}`,
    category: isMovie ? 'movies' : 'series',
    itemType: isMovie ? 'movie' : 'series',
    title,
    ...(details.overview ? { description: details.overview } : {}),
    ...(releaseDate ? { releaseDate, releaseDatePrecision: 'day' as const } : {}),
    externalIds,
    externalLinks: [{ provider: 'tmdb', url: pageUrl }],
    primaryImage: details.poster_path
      ? {
          url: `${TMDB_IMAGE_BASE}${details.poster_path}`,
          source: 'tmdb',
          sourceImageId: `poster:${details.poster_path}`,
          alt: title,
          licenseUrl: TMDB_TERMS_URL,
          attributionRequired: true,
          descriptionUrl: pageUrl,
          // Las condiciones no permiten copiarlo más allá de una caché temporal: se sirve desde TMDb.
          restrictions: 'reference-only',
        }
      : null,
    metadata: {
      ...(details.original_language ? { originalLanguage: details.original_language } : {}),
      ...(details.genres?.length ? { genres: details.genres.map((g) => g.name) } : {}),
      providerCache: {
        provider: TMDB_CATALOG_PROVIDER_KEY,
        providerItemId: `${media}:${details.id}`,
        fetchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + TMDB_CACHE_MAX_DAYS * DAY_MS).toISOString(),
      },
    },
  };
}

export interface TmdbCatalogProviderOptions extends TmdbClientOptions {
  now?: () => Date;
}

/**
 * Proveedor de catálogo TMDb (solo dataset `live`; la demo no llama a la red). Resuelve únicamente por ID —de TMDb
 * o de IMDb—, nunca por título parecido. Usa el token de la APLICACIÓN; no conoce sesiones de usuario.
 */
export class TmdbCatalogProvider implements CatalogProvider {
  readonly key = TMDB_CATALOG_PROVIDER_KEY;
  readonly datasets = ['live'] as const;
  private readonly client: TmdbClient;
  private readonly now: () => Date;

  constructor(options: TmdbCatalogProviderOptions) {
    this.client = new TmdbClient(options);
    this.now = options.now ?? (() => new Date());
  }

  async getItem(externalId: string): Promise<ProviderCatalogItem> {
    const ref = parseItemId(externalId);
    if (!ref) throw new Error(`ID de TMDb no válido: ${externalId}`);
    return tmdbDetailsToCatalogItem(ref.media, await this.client.getDetails(ref.media, ref.id), this.now());
  }

  async search(query: CatalogSearch): Promise<ProviderCatalogItem[]> {
    const medias: TmdbMedia[] =
      query.category === 'movies' ? ['movie'] : query.category === 'series' ? ['tv'] : query.category ? [] : ['movie', 'tv'];
    const results: ProviderCatalogItem[] = [];
    for (const media of medias) {
      const items: TmdbListItem[] = await this.client.search(media, query.query);
      for (const item of items) results.push(tmdbDetailsToCatalogItem(media, item, this.now()));
    }
    return results.slice(0, query.limit ?? 20);
  }

  async resolve(candidate: ExternalItemCandidate): Promise<CatalogMatch | null> {
    const media = MEDIA_BY_CATEGORY[candidate.category as keyof typeof MEDIA_BY_CATEGORY];
    if (!media) return null;
    try {
      // Un ID de película nunca resuelve una serie ni al revés (tmdb:movie:603 ≠ tmdb:tv:603).
      const ownId = candidate.canonicalIds?.[`tmdb:${media}`];
      if (ownId && /^\d+$/.test(ownId)) {
        return { item: await this.getItem(`${media}:${ownId}`), matchedBy: 'provider_id', confidence: CONFIDENCE.providerId };
      }
      const imdb = candidate.canonicalIds?.['imdb:title'];
      if (imdb && /^tt\d+$/.test(imdb)) {
        const found = await this.client.findByImdbId(imdb);
        if (found && found.media === media) {
          return { item: await this.getItem(`${found.media}:${found.id}`), matchedBy: 'canonical_id', confidence: CONFIDENCE.canonicalId };
        }
      }
      return null;
    } catch (error) {
      // Objeto retirado de TMDb: se resuelve sin el proveedor. Cualquier otro fallo se propaga (el sync se reintenta).
      if (isSourceError(error) && error.code === 'not_found') return null;
      throw error;
    }
  }
}

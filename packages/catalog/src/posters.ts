import { catalogExternalIds, catalogImages, catalogItems, type Database } from '@appinity/database';
import type { Dataset } from '@appinity/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';

/**
 * Carteles de películas y series (2026-10-27), por enlace y con su crédito:
 * - Series → TVmaze (sin clave). Datos CC BY-SA 4.0; uso comercial permitido con crédito; imágenes por enlace
 *   (docs/fuentes-de-datos.md). Se identifica por el ID de IMDb de Wikidata (P345).
 * - Películas (y series sin TVmaze) → TMDb, solo con TMDB_API_KEY. Gratis para uso NO comercial y con atribución
 *   («This product uses the TMDB API but is not endorsed or certified by TMDB»). Antes de monetizar hay que firmar un
 *   acuerdo con TMDb o retirarla (decisions.md, 2026-10-27). IDs de TMDb en Wikidata: P4947 (película), P4983 (serie).
 * Un cartel tiene prioridad sobre el logotipo o la foto de Commons; no se cachea (las imágenes se sirven por enlace).
 */
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const TVMAZE_LOOKUP = 'https://api.tvmaze.com/lookup/shows';
const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGES = 'https://image.tmdb.org/t/p/w780';

export interface PosterOptions {
  userAgent: string;
  /** Clave de TMDb (v3). Sin ella, solo TVmaze. */
  tmdbApiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface PosterResult {
  candidates: number;
  tvmaze: number;
  tmdb: number;
}

interface Poster {
  source: 'tvmaze' | 'tmdb';
  url: string;
  descriptionUrl: string;
  license: string;
  licenseUrl: string;
}

type Claims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
const firstString = (claims: Claims | undefined, property: string): string | undefined => {
  const v = claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' && v ? v : undefined;
};

export async function enrichPosters(db: Database, options: PosterOptions & { dataset?: Dataset; limit?: number }): Promise<PosterResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const headers = { 'User-Agent': options.userAgent, Accept: 'application/json' };
  // Obras con QID sin cartel todavía (sin imagen, o con logotipo o foto de Commons).
  const rows = await db
    .select({ itemId: catalogItems.id, category: catalogItems.category, title: catalogItems.title, qid: catalogExternalIds.externalId, imageId: catalogImages.id })
    .from(catalogItems)
    .innerJoin(catalogExternalIds, and(eq(catalogExternalIds.catalogItemId, catalogItems.id), eq(catalogExternalIds.provider, 'wikidata'), eq(catalogExternalIds.idType, 'entity')))
    .leftJoin(catalogImages, eq(catalogImages.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(catalogItems.dataset, options.dataset ?? 'live'),
        inArray(catalogItems.category, ['movies', 'series']),
        sql`${catalogExternalIds.externalId} ~ '^Q[0-9]+$'`,
        sql`(${catalogImages.id} is null or (${catalogImages.source} = 'wikimedia_commons' and coalesce(${catalogImages.kind}, 'photo') <> 'poster'))`,
        // Sin revisar, o revisada sin TMDb cuando ahora sí hay clave.
        options.tmdbApiKey
          ? sql`(NOT (${catalogItems.metadata} ? 'posterCheckedAt') OR coalesce((${catalogItems.metadata}->>'posterWithTmdb')::boolean, false) = false)`
          : sql`NOT (${catalogItems.metadata} ? 'posterCheckedAt')`,
      ),
    )
    .limit(options.limit ?? 150);
  const result: PosterResult = { candidates: rows.length, tvmaze: 0, tmdb: 0 };
  if (!rows.length) return result;

  // IDs externos de Wikidata: IMDb (P345) y TMDb (P4947 película, P4983 serie).
  const claims = new Map<string, Claims>();
  for (let i = 0; i < rows.length; i += 50) {
    const ids = [...new Set(rows.slice(i, i + 50).map((r) => r.qid))];
    const response = await fetchImpl(`${WIKIDATA_API}?action=wbgetentities&format=json&props=claims&ids=${ids.join('|')}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) break;
    const data = (await response.json()) as { entities?: Record<string, { claims?: Claims }> };
    for (const [qid, e] of Object.entries(data.entities ?? {})) claims.set(qid, e.claims ?? {});
    await sleep(200);
  }

  for (const row of rows) {
    const c = claims.get(row.qid);
    if (!c) continue; // Wikidata no respondió: se reintentará.
    let poster: Poster | null = null;
    const imdb = firstString(c, 'P345');
    if (row.category === 'series' && imdb && /^tt\d+$/.test(imdb)) {
      const response = await fetchImpl(`${TVMAZE_LOOKUP}?imdb=${imdb}`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (response?.ok) {
        const show = (await response.json()) as { url?: string; image?: { original?: string; medium?: string } | null };
        const url = show.image?.original ?? show.image?.medium;
        if (url?.startsWith('https://')) {
          poster = { source: 'tvmaze', url, descriptionUrl: show.url ?? 'https://www.tvmaze.com', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
        }
      }
      await sleep(600); // TVmaze: 20 peticiones cada 10 s.
    }
    if (!poster && options.tmdbApiKey) {
      const tmdbId = firstString(c, row.category === 'movies' ? 'P4947' : 'P4983');
      if (tmdbId && /^\d+$/.test(tmdbId)) {
        const kind = row.category === 'movies' ? 'movie' : 'tv';
        const response = await fetchImpl(`${TMDB_API}/${kind}/${tmdbId}?api_key=${encodeURIComponent(options.tmdbApiKey)}&language=es-ES`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
        if (response?.ok) {
          const data = (await response.json()) as { poster_path?: string | null };
          if (data.poster_path) {
            poster = { source: 'tmdb', url: `${TMDB_IMAGES}${data.poster_path}`, descriptionUrl: `https://www.themoviedb.org/${kind}/${tmdbId}`, license: 'uso no comercial', licenseUrl: 'https://www.themoviedb.org/api-terms-of-use' };
          }
        }
        await sleep(250);
      }
    }
    if (poster) {
      const values = {
        source: poster.source,
        sourceImageId: poster.url,
        url: poster.url,
        originalUrl: poster.url,
        mime: null,
        width: null,
        height: null,
        alt: row.title,
        author: null,
        license: poster.license,
        licenseUrl: poster.licenseUrl,
        attributionRequired: true,
        descriptionUrl: poster.descriptionUrl,
        restrictions: null,
        kind: 'poster' as const,
        cacheStatus: 'reference' as const,
        storageKey: null,
        cacheError: null,
        fetchedAt: new Date(),
        updatedAt: new Date(),
      };
      if (row.imageId) await db.update(catalogImages).set(values).where(eq(catalogImages.id, row.imageId));
      else await db.insert(catalogImages).values({ catalogItemId: row.itemId, role: 'primary', ...values }).onConflictDoNothing();
      result[poster.source]++;
    }
    // Revisado (con o sin cartel): no se vuelve a preguntar hasta que haya clave de TMDb nueva o se borre la marca.
    await db
      .update(catalogItems)
      .set({ metadata: sql`${catalogItems.metadata} || ${JSON.stringify({ posterCheckedAt: new Date().toISOString(), posterWithTmdb: Boolean(options.tmdbApiKey) })}::jsonb` })
      .where(eq(catalogItems.id, row.itemId));
  }
  return result;
}

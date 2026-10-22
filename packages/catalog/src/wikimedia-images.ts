import { catalogExternalIds, catalogImages, catalogItems, type Database } from '@appinity/database';
import type { Dataset } from '@appinity/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';

/**
 * Imágenes del catálogo real desde Wikidata y Wikimedia Commons (gratis, con licencia libre y autoría).
 * - Wikidata: P18 (imagen) y, si falta, P154 (logotipo) del objeto identificado por QID.
 * - Commons: miniatura de 960 px y metadatos de licencia; solo se aceptan licencias libres (dominio público, CC0,
 *   CC BY, CC BY-SA, GFDL…), igual que la instantánea de la demo.
 * Se guarda como referencia (`cacheStatus: 'reference'`) y el worker la cachea después, a ritmo limitado.
 */
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const THUMB_WIDTH = 960;
const ACCEPTED_LICENSE = /^(public domain|pd\b|pd-|cc0|cc[ -]by|cc-by|attribution|gfdl|l?gpl|no restrictions)/i;

export interface CommonsImage {
  source: 'wikimedia_commons';
  sourceImageId: string;
  url: string;
  originalUrl: string;
  width?: number;
  height?: number;
  mime?: string;
  license: string;
  licenseUrl?: string;
  author?: string;
  attributionRequired: boolean;
  restrictions?: string;
  descriptionUrl?: string;
}

export interface WikimediaImageOptions {
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function stripHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text || undefined;
}

const chunk = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export class WikimediaImages {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: WikimediaImageOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async json(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchImpl(url, { headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await this.sleep(2_000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Wikimedia respondió HTTP ${response.status}`);
      return response.json();
    }
  }

  /** Nombre del fichero de Commons de cada QID (P18 y, si falta, P154). */
  async filesFor(qids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const batch of chunk([...new Set(qids)], 50)) {
      const url = `${WIKIDATA_API}?action=wbgetentities&format=json&props=claims&ids=${batch.join('|')}`;
      const data = (await this.json(url)) as { entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }> };
      for (const [qid, entity] of Object.entries(data.entities ?? {})) {
        for (const property of ['P18', 'P154']) {
          const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
          if (typeof value === 'string' && value) {
            out.set(qid, value);
            break;
          }
        }
      }
      await this.sleep(200);
    }
    return out;
  }

  /** Miniatura y licencia de cada fichero; los de licencia no libre se descartan. */
  async images(files: string[]): Promise<Map<string, CommonsImage>> {
    const out = new Map<string, CommonsImage>();
    for (const batch of chunk([...new Set(files)], 20)) {
      const url =
        `${COMMONS_API}?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${THUMB_WIDTH}` +
        '&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|AttributionRequired|Restrictions' +
        `&titles=${encodeURIComponent(batch.map((f) => `File:${f}`).join('|'))}`;
      const data = (await this.json(url)) as {
        query?: {
          normalized?: Array<{ from: string; to: string }>;
          pages?: Record<string, { title: string; imageinfo?: Array<Record<string, unknown> & { extmetadata?: Record<string, { value?: string }> }> }>;
        };
      };
      const normalized = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
      for (const page of Object.values(data.query?.pages ?? {})) {
        const info = page.imageinfo?.[0];
        if (!info) continue;
        const meta = info.extmetadata ?? {};
        const license = meta.LicenseShortName?.value ?? '';
        if (!ACCEPTED_LICENSE.test(license)) continue;
        const requested = (normalized.get(page.title) ?? page.title).replace(/^File:/, '');
        const url = String(info.thumburl ?? info.url ?? '');
        if (!url.startsWith('https://')) continue;
        out.set(requested, {
          source: 'wikimedia_commons',
          sourceImageId: page.title,
          url,
          originalUrl: String(info.url ?? url),
          ...(typeof (info.thumbwidth ?? info.width) === 'number' ? { width: Number(info.thumbwidth ?? info.width) } : {}),
          ...(typeof (info.thumbheight ?? info.height) === 'number' ? { height: Number(info.thumbheight ?? info.height) } : {}),
          ...(typeof info.mime === 'string' ? { mime: info.mime } : {}),
          license,
          ...(meta.LicenseUrl?.value ? { licenseUrl: meta.LicenseUrl.value } : {}),
          ...(stripHtml(meta.Artist?.value) ? { author: stripHtml(meta.Artist?.value)! } : {}),
          attributionRequired: meta.AttributionRequired?.value === 'true',
          ...(meta.Restrictions?.value ? { restrictions: meta.Restrictions.value } : {}),
          ...(typeof info.descriptionurl === 'string' ? { descriptionUrl: info.descriptionurl } : {}),
        });
      }
      await this.sleep(300);
    }
    return out;
  }
}

export interface ImageEnrichmentResult {
  candidates: number;
  withFile: number;
  inserted: number;
  imageIds: string[];
}

/**
 * Pone imagen a los objetos del catálogo que tienen QID de Wikidata y aún no tienen imagen. Idempotente: un objeto con
 * imagen no se toca (índice único por objeto y rol).
 */
export async function enrichImagesFromWikidata(
  db: Database,
  images: WikimediaImages,
  options: { dataset?: Dataset; limit?: number } = {},
): Promise<ImageEnrichmentResult> {
  const rows = await db
    .select({ itemId: catalogItems.id, title: catalogItems.title, qid: catalogExternalIds.externalId })
    .from(catalogItems)
    .innerJoin(catalogExternalIds, and(eq(catalogExternalIds.catalogItemId, catalogItems.id), eq(catalogExternalIds.provider, 'wikidata'), eq(catalogExternalIds.idType, 'entity')))
    .leftJoin(catalogImages, eq(catalogImages.catalogItemId, catalogItems.id))
    .where(and(eq(catalogItems.dataset, options.dataset ?? 'live'), isNull(catalogImages.id), sql`${catalogExternalIds.externalId} ~ '^Q[0-9]+$'`))
    .limit(options.limit ?? 500);
  const byQid = new Map<string, { itemId: string; title: string }>();
  for (const r of rows) if (!byQid.has(r.qid)) byQid.set(r.qid, { itemId: r.itemId, title: r.title });
  const files = await images.filesFor([...byQid.keys()]);
  const found = await images.images([...files.values()]);
  const imageIds: string[] = [];
  for (const [qid, file] of files) {
    const image = found.get(file);
    const item = byQid.get(qid);
    if (!image || !item) continue;
    const [row] = await db
      .insert(catalogImages)
      .values({
        catalogItemId: item.itemId,
        role: 'primary',
        source: image.source,
        sourceImageId: image.sourceImageId,
        url: image.url,
        originalUrl: image.originalUrl,
        mime: image.mime ?? null,
        width: image.width ?? null,
        height: image.height ?? null,
        alt: item.title,
        author: image.author ?? null,
        license: image.license,
        licenseUrl: image.licenseUrl ?? null,
        attributionRequired: image.attributionRequired,
        descriptionUrl: image.descriptionUrl ?? null,
        restrictions: image.restrictions ?? null,
        cacheStatus: 'reference',
        fetchedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: catalogImages.id });
    if (row) imageIds.push(row.id);
  }
  return { candidates: byQid.size, withFile: files.size, inserted: imageIds.length, imageIds };
}

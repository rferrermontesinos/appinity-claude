import { catalogExternalIds, catalogImages, catalogItems, type Database } from '@appinity/database';
import type { Category, Dataset, ImageKind } from '@appinity/shared';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

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

type WikidataClaims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;

/** Personas que «firman» una obra: director, autor, desarrollador y creador (series y otras obras). */
const CREATOR_PROPERTIES = ['P57', 'P50', 'P178', 'P170'];

export interface WikidataDetails {
  description: string | null;
  creators: string[];
  genres: string[];
}

export interface ImageClaim {
  file: string;
  kind: ImageKind;
}

/**
 * Propiedades de Wikidata que dan una imagen representativa, por orden de preferencia y categoría:
 * - Películas y series: cartel (P3383) y, si no hay uno libre, logotipo del título (P154). Nunca la imagen genérica
 *   (P18): suele ser una foto del reparto, de un estreno o de un rodaje, que no representa la obra.
 * - Podcasts: logotipo antes que foto (P18 suele ser el presentador).
 * - Resto: foto (P18) y, si falta, logotipo. En restaurantes y cultura no hay logotipo útil.
 */
export const IMAGE_CLAIMS: Record<Category, Array<[property: string, kind: ImageKind]>> = {
  movies: [['P3383', 'poster'], ['P154', 'logo']],
  series: [['P3383', 'poster'], ['P154', 'logo']],
  podcasts: [['P154', 'logo'], ['P18', 'photo']],
  books: [['P18', 'photo'], ['P154', 'logo']],
  music: [['P18', 'photo'], ['P154', 'logo']],
  games: [['P18', 'photo'], ['P154', 'logo']],
  culture: [['P18', 'photo']],
  food: [['P18', 'photo']],
};

/** Primer fichero de Commons disponible según `IMAGE_CLAIMS`. Un SVG siempre se trata como logotipo. */
export function pickImageClaim(claims: WikidataClaims, category: Category): ImageClaim | null {
  for (const [property, kind] of IMAGE_CLAIMS[category]) {
    const value = claims[property]?.[0]?.mainsnak?.datavalue?.value;
    if (typeof value === 'string' && value) return { file: value, kind: /\.svg$/i.test(value) ? 'logo' : kind };
  }
  return null;
}

/** Nombre de fichero comparable: sin «File:» y con espacios en lugar de guiones bajos. */
const sameFile = (a: string, b: string) => {
  const n = (s: string) => s.replace(/^File:/i, '').replace(/_/g, ' ').trim().toLowerCase();
  return n(a) === n(b);
};

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

  /** Fichero de Commons más representativo de cada QID según su categoría (ver `pickImageClaim`). */
  async filesFor(entries: Array<{ qid: string; category: Category }>): Promise<Map<string, ImageClaim | null>> {
    const categoryOf = new Map(entries.map((e) => [e.qid, e.category]));
    // null = Wikidata respondió pero no hay imagen válida; sin clave = no se sabe (no se toca nada).
    const out = new Map<string, ImageClaim | null>();
    for (const batch of chunk([...categoryOf.keys()], 50)) {
      const url = `${WIKIDATA_API}?action=wbgetentities&format=json&props=claims&ids=${batch.join('|')}`;
      const data = (await this.json(url)) as { entities?: Record<string, { claims?: WikidataClaims }> };
      for (const [qid, entity] of Object.entries(data.entities ?? {})) {
        const category = categoryOf.get(qid);
        const claim = category ? pickImageClaim(entity.claims ?? {}, category) : null;
        if (category) out.set(qid, claim);
      }
      await this.sleep(200);
    }
    return out;
  }

  /**
   * Detalles legibles de cada QID para la línea de contexto de las tarjetas: descripción corta (es, en o ca), personas
   * (director, autor, desarrollador o creador) y géneros, con sus etiquetas. Solo datos de Wikidata (CC0).
   */
  async detailsFor(qids: string[]): Promise<Map<string, WikidataDetails>> {
    type Entity = { descriptions?: Record<string, { value: string }>; labels?: Record<string, { value: string }>; claims?: WikidataClaims };
    const entities = new Map<string, Entity>();
    for (const batch of chunk([...new Set(qids)], 50)) {
      const url = `${WIKIDATA_API}?action=wbgetentities&format=json&props=claims|descriptions&languages=es|en|ca&ids=${batch.join('|')}`;
      const data = (await this.json(url)) as { entities?: Record<string, Entity> };
      for (const [qid, entity] of Object.entries(data.entities ?? {})) entities.set(qid, entity);
      await this.sleep(200);
    }
    const refsOf = (entity: Entity, property: string) =>
      (entity.claims?.[property] ?? [])
        .map((c) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id)
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 3);
    const referenced = new Set<string>();
    for (const entity of entities.values()) for (const p of [...CREATOR_PROPERTIES, 'P136']) for (const id of refsOf(entity, p)) referenced.add(id);
    const labels = new Map<string, string>();
    for (const batch of chunk([...referenced], 50)) {
      const url = `${WIKIDATA_API}?action=wbgetentities&format=json&props=labels&languages=es|en|ca&ids=${batch.join('|')}`;
      const data = (await this.json(url)) as { entities?: Record<string, Entity> };
      for (const [id, entity] of Object.entries(data.entities ?? {})) {
        const label = entity.labels?.es?.value ?? entity.labels?.en?.value ?? entity.labels?.ca?.value;
        if (label) labels.set(id, label);
      }
      await this.sleep(200);
    }
    const out = new Map<string, WikidataDetails>();
    for (const [qid, entity] of entities) {
      const names = (props: string[]) => [...new Set(props.flatMap((p) => refsOf(entity, p)).map((id) => labels.get(id)).filter((l): l is string => Boolean(l)))].slice(0, 3);
      out.set(qid, {
        description: entity.descriptions?.es?.value ?? entity.descriptions?.en?.value ?? entity.descriptions?.ca?.value ?? null,
        creators: names(CREATOR_PROPERTIES),
        genres: names(['P136']),
      });
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
  /** Con `refresh`: imágenes de Commons cambiadas por otra más representativa o reclasificadas. */
  updated: number;
  /** Con `refresh`: imágenes de Commons quitadas porque las reglas actuales no dan ninguna (queda la de sustitución). */
  removed: number;
  /** Imágenes nuevas o cambiadas, para que el worker las cachee. */
  imageIds: string[];
}

/**
 * Pone imagen a los objetos del catálogo que tienen QID de Wikidata y aún no tienen imagen. Idempotente: un objeto con
 * imagen no se toca (índice único por objeto y rol).
 *
 * Con `refresh`, además reevalúa las imágenes de Commons ya guardadas con las reglas actuales (`IMAGE_CLAIMS`): cambia
 * las que ya no son la más representativa, guarda su tipo y quita las que no deberían estar (p. ej., la foto de un
 * estreno como imagen de una película). Solo actúa sobre objetos por los que Wikidata ha respondido.
 */
export async function enrichImagesFromWikidata(
  db: Database,
  images: WikimediaImages,
  options: { dataset?: Dataset; limit?: number; refresh?: boolean } = {},
): Promise<ImageEnrichmentResult> {
  const rows = await db
    .select({
      itemId: catalogItems.id,
      title: catalogItems.title,
      category: catalogItems.category,
      qid: catalogExternalIds.externalId,
      imageId: catalogImages.id,
      imageFile: catalogImages.sourceImageId,
      imageKind: catalogImages.kind,
    })
    .from(catalogItems)
    .innerJoin(catalogExternalIds, and(eq(catalogExternalIds.catalogItemId, catalogItems.id), eq(catalogExternalIds.provider, 'wikidata'), eq(catalogExternalIds.idType, 'entity')))
    .leftJoin(catalogImages, eq(catalogImages.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(catalogItems.dataset, options.dataset ?? 'live'),
        options.refresh ? or(isNull(catalogImages.id), eq(catalogImages.source, 'wikimedia_commons')) : isNull(catalogImages.id),
        sql`${catalogExternalIds.externalId} ~ '^Q[0-9]+$'`,
      ),
    )
    .limit(options.limit ?? 500);
  type Row = (typeof rows)[number];
  const byQid = new Map<string, Row>();
  for (const r of rows) if (!byQid.has(r.qid)) byQid.set(r.qid, r);
  const claims = await images.filesFor([...byQid.values()].map((r) => ({ qid: r.qid, category: r.category as Category })));
  const found = await images.images([...claims.values()].flatMap((c) => (c ? [c.file] : [])));

  const result: ImageEnrichmentResult = { candidates: byQid.size, withFile: 0, inserted: 0, updated: 0, removed: 0, imageIds: [] };
  for (const [qid, row] of byQid) {
    if (!claims.has(qid)) continue; // Wikidata no respondió por este objeto: no se toca.
    const claim = claims.get(qid) ?? null;
    const image = claim ? found.get(claim.file) : undefined;
    if (claim) result.withFile++;
    const values = image
      ? {
          source: image.source,
          sourceImageId: image.sourceImageId,
          url: image.url,
          originalUrl: image.originalUrl,
          mime: image.mime ?? null,
          width: image.width ?? null,
          height: image.height ?? null,
          alt: row.title,
          author: image.author ?? null,
          license: image.license,
          licenseUrl: image.licenseUrl ?? null,
          attributionRequired: image.attributionRequired,
          descriptionUrl: image.descriptionUrl ?? null,
          restrictions: image.restrictions ?? null,
          kind: claim!.kind,
          fetchedAt: new Date(),
        }
      : null;

    if (!row.imageId) {
      if (!values) continue;
      const [inserted] = await db
        .insert(catalogImages)
        .values({ catalogItemId: row.itemId, role: 'primary', cacheStatus: 'reference', ...values })
        .onConflictDoNothing()
        .returning({ id: catalogImages.id });
      if (inserted) {
        result.inserted++;
        result.imageIds.push(inserted.id);
      }
      continue;
    }

    // Revisión de una imagen de Commons ya guardada.
    if (!values) {
      await db.delete(catalogImages).where(eq(catalogImages.id, row.imageId));
      result.removed++;
    } else if (row.imageFile && sameFile(row.imageFile, values.sourceImageId)) {
      if (row.imageKind !== values.kind) {
        await db.update(catalogImages).set({ kind: values.kind, updatedAt: new Date() }).where(eq(catalogImages.id, row.imageId));
        result.updated++;
      }
    } else {
      // Otra imagen: vuelve a ser una referencia y el worker la cachea de nuevo.
      await db
        .update(catalogImages)
        .set({ ...values, cacheStatus: 'reference', storageKey: null, cacheError: null, updatedAt: new Date() })
        .where(eq(catalogImages.id, row.imageId));
      result.updated++;
      result.imageIds.push(row.imageId);
    }
  }
  return result;
}

export interface DetailsEnrichmentResult {
  candidates: number;
  updated: number;
}

/**
 * Completa los objetos del catálogo real con descripción, personas y géneros de Wikidata, para la línea de contexto de
 * las tarjetas. No pisa una descripción existente; los metadatos se fusionan. `metadata.detailsCheckedAt` evita
 * volver a consultar un objeto ya revisado.
 */
export async function enrichDetailsFromWikidata(
  db: Database,
  client: WikimediaImages,
  options: { dataset?: Dataset; limit?: number } = {},
): Promise<DetailsEnrichmentResult> {
  const rows = await db
    .select({ itemId: catalogItems.id, qid: catalogExternalIds.externalId, description: catalogItems.description, metadata: catalogItems.metadata })
    .from(catalogItems)
    .innerJoin(catalogExternalIds, and(eq(catalogExternalIds.catalogItemId, catalogItems.id), eq(catalogExternalIds.provider, 'wikidata'), eq(catalogExternalIds.idType, 'entity')))
    .where(
      and(
        eq(catalogItems.dataset, options.dataset ?? 'live'),
        sql`${catalogExternalIds.externalId} ~ '^Q[0-9]+$'`,
        sql`NOT (${catalogItems.metadata} ? 'detailsCheckedAt')`,
      ),
    )
    .limit(options.limit ?? 300);
  if (!rows.length) return { candidates: 0, updated: 0 };
  const details = await client.detailsFor(rows.map((r) => r.qid));
  let updated = 0;
  for (const row of rows) {
    const d = details.get(row.qid);
    if (!d) continue; // Wikidata no respondió por este objeto: se reintentará en la próxima pasada.
    const previous = row.metadata ?? {};
    const keep = (key: string) => (Array.isArray(previous[key]) && (previous[key] as unknown[]).length ? previous[key] : undefined);
    const metadata = {
      ...previous,
      creators: keep('creators') ?? d.creators,
      genres: keep('genres') ?? d.genres,
      detailsCheckedAt: new Date().toISOString(),
    };
    await db
      .update(catalogItems)
      .set({ metadata, ...(row.description ? {} : d.description ? { description: d.description } : {}), updatedAt: new Date() })
      .where(eq(catalogItems.id, row.itemId));
    updated++;
  }
  return { candidates: rows.length, updated };
}

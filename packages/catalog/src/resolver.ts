import {
  catalogExternalIds,
  catalogImages,
  catalogItems,
  type Database,
} from '@appinity/database';
import {
  CANONICAL_ID_KEYS,
  type CatalogProvider,
  type ExternalIdRef,
  type ExternalItemCandidate,
  type ProviderCatalogItem,
} from '@appinity/shared';
import { and, eq, or, sql } from 'drizzle-orm';
import { RESOLUTION_CONFIDENCE } from './providers/wikidata-snapshot.js';
import { haversineMeters, normalizeTitle, yearOf } from './text.js';

export type Dataset = 'demo' | 'live';
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Db = Database | Tx;

export type ResolutionMethod = 'canonical_id' | 'provider_id' | 'catalog_provider' | 'attributes' | 'created_from_source';

export interface ResolutionResult {
  /** Objeto al que corresponde el identificador (p. ej. una edición concreta). */
  itemId: string;
  /** Objeto al que se atribuye la evidencia (p. ej. la obra de esa edición). */
  targetItemId: string;
  method: ResolutionMethod;
  confidence: number;
  itemsCreated: number;
  notes: string[];
}

/** Tipos cuya evidencia se agrega al objeto padre: una edición (ISBN) cuenta para su obra. */
const AGGREGATE_TO_PARENT = new Set(['book_edition']);

export function splitIdKey(key: string): { provider: string; idType: string } | null {
  const [provider, idType, ...rest] = key.split(':');
  if (!provider || !idType || rest.length) return null;
  return { provider, idType };
}

function isCanonical(ref: { provider: string; idType: string }): boolean {
  return (CANONICAL_ID_KEYS as readonly string[]).includes(`${ref.provider}:${ref.idType}`);
}

function priority(ref: { provider: string; idType: string }): number {
  const i = (CANONICAL_ID_KEYS as readonly string[]).indexOf(`${ref.provider}:${ref.idType}`);
  return i === -1 ? 100 : i;
}

/** Referencias externas del candidato: IDs declarados + el ID propio de la fuente (identificador del proveedor). */
export function candidateRefs(candidate: ExternalItemCandidate): ExternalIdRef[] {
  const refs: ExternalIdRef[] = [];
  for (const [key, value] of Object.entries(candidate.canonicalIds ?? {})) {
    const parts = splitIdKey(key);
    if (parts) refs.push({ ...parts, value });
  }
  refs.push({ provider: candidate.sourceKey, idType: 'item', value: candidate.sourceId });
  return refs.sort((a, b) => priority(a) - priority(b));
}

/**
 * Resolución de entidades (§6). Orden: ID canónico exacto en el catálogo → ID del proveedor → proveedores de
 * catálogo (que resuelven por ID y, en último término, por atributos exactos) → atributos exactos en el
 * catálogo → creación a partir del candidato. Un título parecido nunca basta para fusionar dos objetos.
 */
export class EntityResolver {
  constructor(
    private readonly db: Database,
    private readonly providers: readonly CatalogProvider[],
  ) {}

  async resolve(candidate: ExternalItemCandidate, dataset: Dataset): Promise<ResolutionResult> {
    const notes: string[] = [];
    const refs = candidateRefs(candidate);
    let itemsCreated = 0;

    const match = await this.findByRefs(this.db, refs, dataset, notes);
    let method: ResolutionMethod | null = match ? (isCanonical(match.ref) ? 'canonical_id' : 'provider_id') : null;
    let confidence: number = match
      ? isCanonical(match.ref)
        ? RESOLUTION_CONFIDENCE.canonicalId
        : RESOLUTION_CONFIDENCE.providerId
      : 0;
    let itemId = match?.itemId ?? null;

    if (!itemId) {
      for (const provider of this.providers) {
        if (provider.datasets && !provider.datasets.includes(dataset)) continue;
        const found = await provider.resolve(candidate);
        if (!found) continue;
        const upserted = await this.upsertProviderItem(found.item, dataset, provider);
        itemsCreated += upserted.created;
        itemId = upserted.itemId;
        method = 'catalog_provider';
        confidence = found.confidence;
        notes.push(`${provider.key}:${found.matchedBy}`);
        break;
      }
    }

    if (!itemId) {
      const byAttributes = await this.findByAttributes(candidate, dataset);
      if (byAttributes) {
        itemId = byAttributes;
        method = 'attributes';
        confidence = RESOLUTION_CONFIDENCE.attributes;
      }
    }

    if (!itemId) {
      itemId = await this.createFromCandidate(candidate, dataset);
      itemsCreated += 1;
      method = 'created_from_source';
      confidence = 1;
    }

    await this.attachRefs(this.db, itemId, refs, dataset, candidate.sourceKey, notes);
    if (method !== 'created_from_source') await this.ensureImageReference(itemId, candidate);

    const [row] = await this.db
      .select({ itemType: catalogItems.itemType, parentItemId: catalogItems.parentItemId })
      .from(catalogItems)
      .where(eq(catalogItems.id, itemId));
    const targetItemId =
      row && AGGREGATE_TO_PARENT.has(row.itemType) && row.parentItemId ? row.parentItemId : itemId;

    return { itemId, targetItemId, method: method!, confidence, itemsCreated, notes };
  }

  /** Busca por referencias externas; si apuntan a objetos distintos gana la de mayor prioridad y se anota. */
  private async findByRefs(db: Db, refs: ExternalIdRef[], dataset: Dataset, notes: string[]) {
    if (!refs.length) return null;
    const rows = await db
      .select({
        itemId: catalogExternalIds.catalogItemId,
        provider: catalogExternalIds.provider,
        idType: catalogExternalIds.idType,
        value: catalogExternalIds.externalId,
      })
      .from(catalogExternalIds)
      .where(
        and(
          eq(catalogExternalIds.dataset, dataset),
          or(
            ...refs.map((r) =>
              and(
                eq(catalogExternalIds.provider, r.provider),
                eq(catalogExternalIds.idType, r.idType),
                eq(catalogExternalIds.externalId, r.value),
              ),
            ),
          ),
        ),
      );
    if (!rows.length) return null;
    const sorted = rows.sort((a, b) => priority(a) - priority(b));
    const distinct = new Set(sorted.map((r) => r.itemId));
    if (distinct.size > 1) notes.push(`conflicto_ids:${[...distinct].join(',')}`);
    const best = sorted[0]!;
    return { itemId: best.itemId, ref: { provider: best.provider, idType: best.idType } };
  }

  /** Coincidencia exacta de título normalizado + categoría + tipo + año (o ubicación a ≤150 m). */
  private async findByAttributes(candidate: ExternalItemCandidate, dataset: Dataset): Promise<string | null> {
    const year = candidate.attributes?.releaseYear;
    const location = candidate.attributes?.location;
    if (year === undefined && !location) return null;
    const rows = await this.db
      .select({
        id: catalogItems.id,
        releaseDate: catalogItems.releaseDate,
        latitude: catalogItems.latitude,
        longitude: catalogItems.longitude,
      })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.dataset, dataset),
          eq(catalogItems.category, candidate.category),
          eq(catalogItems.itemType, candidate.itemType),
          eq(catalogItems.normalizedTitle, normalizeTitle(candidate.title)),
        ),
      );
    const matches = rows.filter(
      (r) =>
        (year === undefined || yearOf(r.releaseDate) === year) &&
        (!location ||
          (r.latitude !== null &&
            r.longitude !== null &&
            haversineMeters({ latitude: r.latitude, longitude: r.longitude }, location) <= 150)),
    );
    return matches.length === 1 ? matches[0]!.id : null;
  }

  /** Añade al objeto los IDs que aún no tiene. Un ID que ya pertenece a otro objeto no se mueve. */
  private async attachRefs(db: Db, itemId: string, refs: ExternalIdRef[], dataset: Dataset, contributedBy: string, notes: string[]) {
    if (!refs.length) return;
    const inserted = await db
      .insert(catalogExternalIds)
      .values(refs.map((r) => ({ catalogItemId: itemId, dataset, provider: r.provider, idType: r.idType, externalId: r.value, contributedBy })))
      .onConflictDoNothing()
      .returning({ id: catalogExternalIds.id });
    if (inserted.length < refs.length) {
      const owners = await this.findByRefs(db, refs, dataset, []);
      if (owners && owners.itemId !== itemId) notes.push(`id_de_otro_objeto:${owners.itemId}`);
    }
  }

  /**
   * Si el objeto no tiene imagen y la fuente aporta una, se guarda como REFERENCIA (no se copia). Nunca sustituye
   * una imagen existente.
   */
  private async ensureImageReference(itemId: string, candidate: ExternalItemCandidate): Promise<void> {
    const image = candidate.imageCandidate;
    if (!image || image.isFallback || !image.url.startsWith('https://')) return;
    await this.db
      .insert(catalogImages)
      .values({
        catalogItemId: itemId,
        source: image.source,
        sourceImageId: image.sourceImageId ?? null,
        url: image.url,
        alt: image.alt,
        width: image.width ?? null,
        height: image.height ?? null,
        ...(image.rightsOrPolicyReference ? { licenseUrl: image.rightsOrPolicyReference } : {}),
        restrictions: 'reference-only',
      })
      .onConflictDoNothing();
  }

  private async createFromCandidate(candidate: ExternalItemCandidate, dataset: Dataset): Promise<string> {
    const location = candidate.attributes?.location;
    return this.db.transaction(async (tx) => {
      await lockRefs(tx, candidateRefs(candidate), dataset);
      const again = await this.findByRefs(tx, candidateRefs(candidate), dataset, []);
      if (again) return again.itemId;
      const [row] = await tx
        .insert(catalogItems)
        .values({
          dataset,
          category: candidate.category,
          itemType: candidate.itemType,
          title: candidate.title,
          normalizedTitle: normalizeTitle(candidate.title),
          ...(candidate.attributes?.releaseYear
            ? { releaseDate: `${candidate.attributes.releaseYear}-01-01`, releaseDatePrecision: 'year' as const }
            : {}),
          ...(location
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                locality: location.locality ?? null,
                countryCode: location.countryCode ?? null,
              }
            : {}),
          metadata: { createdFromSource: candidate.sourceKey, creators: candidate.attributes?.creators ?? [] },
          createdVia: `source:${candidate.sourceKey}`,
        })
        .returning({ id: catalogItems.id });
      const id = row!.id;
      const image = candidate.imageCandidate;
      if (image && !image.isFallback && image.url.startsWith('https://')) {
        await tx.insert(catalogImages).values({
          catalogItemId: id,
          source: image.source,
          sourceImageId: image.sourceImageId ?? null,
          url: image.url,
          alt: image.alt,
          width: image.width ?? null,
          height: image.height ?? null,
          ...(image.attribution ? { author: image.attribution } : {}),
          ...(image.rightsOrPolicyReference ? { licenseUrl: image.rightsOrPolicyReference } : {}),
          // Imágenes aportadas por una fuente de perfil: solo referencia, nunca se copian.
          restrictions: 'reference-only',
        });
      }
      return id;
    });
  }

  /**
   * Inserta (o reutiliza) un objeto de un proveedor de catálogo con sus IDs e imagen. Los padres se crean antes
   * (obra antes que edición, serie antes que temporada).
   */
  async upsertProviderItem(
    item: ProviderCatalogItem,
    dataset: Dataset,
    provider: CatalogProvider,
    options: { refresh?: boolean } = {},
  ): Promise<{ itemId: string; created: number }> {
    let created = 0;
    let parentItemId: string | null = null;
    if (item.parentId) {
      const parent = await this.upsertProviderItem(await provider.getItem(item.parentId), dataset, provider, options);
      parentItemId = parent.itemId;
      created += parent.created;
    }

    const result = await this.db.transaction(async (tx) => {
      await lockRefs(tx, item.externalIds, dataset);
      const existing = await this.findByRefs(tx, item.externalIds, dataset, []);
      const values = {
        dataset,
        category: item.category,
        itemType: item.itemType,
        title: item.title,
        normalizedTitle: normalizeTitle(item.title),
        description: item.description ?? null,
        releaseDate: item.releaseDate ?? null,
        releaseDatePrecision: item.releaseDate ? (item.releaseDatePrecision ?? 'day') : null,
        eventStartsAt: item.eventStartsAt ? new Date(item.eventStartsAt) : null,
        eventEndsAt: item.eventEndsAt ? new Date(item.eventEndsAt) : null,
        eventDatePrecision: item.eventStartsAt || item.eventEndsAt ? (item.eventDatePrecision ?? 'day') : null,
        parentItemId,
        latitude: item.location?.latitude ?? null,
        longitude: item.location?.longitude ?? null,
        locality: item.location?.locality ?? null,
        countryCode: item.location?.countryCode ?? null,
        externalLinks: item.externalLinks,
        metadata: item.metadata,
        createdVia: `catalog:${provider.key}`,
      };

      let itemId: string;
      let isNew = false;
      if (existing) {
        itemId = existing.itemId;
        if (options.refresh) {
          const { createdVia: _createdVia, dataset: _dataset, ...updatable } = values;
          await tx.update(catalogItems).set({ ...updatable, updatedAt: sql`now()` }).where(eq(catalogItems.id, itemId));
        }
      } else {
        const [row] = await tx.insert(catalogItems).values(values).returning({ id: catalogItems.id });
        itemId = row!.id;
        isNew = true;
      }

      await this.attachRefs(tx, itemId, item.externalIds, dataset, provider.key, []);

      const image = item.primaryImage;
      if (image && (isNew || options.refresh)) {
        const imageValues = {
          source: image.source,
          sourceImageId: image.sourceImageId ?? null,
          url: image.url,
          originalUrl: image.originalUrl ?? null,
          mime: image.mime ?? null,
          width: image.width ?? null,
          height: image.height ?? null,
          alt: image.alt,
          author: image.author ?? null,
          license: image.license ?? null,
          licenseUrl: image.licenseUrl ?? null,
          attributionRequired: image.attributionRequired ?? false,
          descriptionUrl: image.descriptionUrl ?? null,
          restrictions: image.restrictions ?? null,
        };
        await tx
          .insert(catalogImages)
          .values({ catalogItemId: itemId, role: 'primary', ...imageValues })
          .onConflictDoUpdate({
            target: [catalogImages.catalogItemId, catalogImages.role],
            // Si cambia la URL de origen, la copia cacheada deja de ser válida.
            set: {
              ...imageValues,
              cacheStatus: sql`CASE WHEN ${catalogImages.url} = ${image.url} THEN ${catalogImages.cacheStatus} ELSE 'reference' END`,
              storageKey: sql`CASE WHEN ${catalogImages.url} = ${image.url} THEN ${catalogImages.storageKey} ELSE NULL END`,
              updatedAt: sql`now()`,
            },
          });
      }
      return { itemId, created: isNew ? 1 : 0 };
    });
    return { itemId: result.itemId, created: created + result.created };
  }
}

/** Bloqueo transaccional por ID externo para que dos syncs concurrentes no creen el mismo objeto dos veces. */
async function lockRefs(tx: Tx, refs: readonly ExternalIdRef[], dataset: Dataset): Promise<void> {
  const keys = [...new Set(refs.map((r) => `${dataset}:${r.provider}:${r.idType}:${r.value}`))].sort();
  for (const key of keys) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}


import { Inject, Injectable } from '@nestjs/common';
import { toCatalogItemDto } from '@appinity/catalog';
import { catalogExternalIds, catalogImages, catalogItems, type DatabaseHandle } from '@appinity/database';
import type { CatalogItemDto, Category, Dataset, Page } from '@appinity/shared';
import { NotFoundError } from '@appinity/ingestion';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { DATABASE } from '../infra/tokens.js';

@Injectable()
export class CatalogQueryService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** Construye los DTO (con imagen propia, del padre o fallback) de un conjunto de objetos. */
  async dtos(itemIds: string[], baseUrl: string): Promise<Map<string, CatalogItemDto>> {
    const db = this.database.db;
    if (!itemIds.length) return new Map();
    const items = await db.select().from(catalogItems).where(inArray(catalogItems.id, itemIds));
    const parentIds = items.map((i) => i.parentItemId).filter((p): p is string => Boolean(p));
    const imageOwners = [...new Set([...itemIds, ...parentIds])];
    const images = await db
      .select()
      .from(catalogImages)
      .where(and(inArray(catalogImages.catalogItemId, imageOwners), eq(catalogImages.role, 'primary')));
    const ids = await db
      .select({
        itemId: catalogExternalIds.catalogItemId,
        provider: catalogExternalIds.provider,
        idType: catalogExternalIds.idType,
        externalId: catalogExternalIds.externalId,
      })
      .from(catalogExternalIds)
      .where(inArray(catalogExternalIds.catalogItemId, itemIds));
    const imageBy = new Map(images.map((i) => [i.catalogItemId, i]));
    const result = new Map<string, CatalogItemDto>();
    for (const item of items) {
      result.set(
        item.id,
        toCatalogItemDto(
          item,
          imageBy.get(item.id) ?? null,
          // Los identificadores internos de fuentes simuladas no se exponen como IDs del objeto.
          ids.filter((e) => e.itemId === item.id && !e.provider.startsWith('fixture_')),
          baseUrl,
          item.parentItemId ? (imageBy.get(item.parentItemId) ?? null) : null,
        ),
      );
    }
    return result;
  }

  /** Catálogo del dataset del usuario. Por defecto, solo objetos principales (sin ediciones ni temporadas). */
  async list(
    dataset: Dataset,
    options: { category?: Category; includeChildren: boolean; limit: number; offset: number },
    baseUrl: string,
  ): Promise<Page<CatalogItemDto> & { total: number }> {
    const db = this.database.db;
    const where = and(
      eq(catalogItems.dataset, dataset),
      options.category ? eq(catalogItems.category, options.category) : undefined,
      options.includeChildren ? undefined : isNull(catalogItems.parentItemId),
    );
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(catalogItems).where(where);
    const rows = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(where)
      .orderBy(asc(catalogItems.normalizedTitle), asc(catalogItems.id))
      .limit(options.limit)
      .offset(options.offset);
    const dtos = await this.dtos(rows.map((r) => r.id), baseUrl);
    const next = options.offset + rows.length;
    return {
      items: rows.map((r) => dtos.get(r.id)!),
      nextCursor: next < total ? String(next) : null,
      total,
    };
  }

  async get(dataset: Dataset, id: string, baseUrl: string): Promise<CatalogItemDto> {
    const [row] = await this.database.db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(and(eq(catalogItems.id, id), eq(catalogItems.dataset, dataset)));
    if (!row) throw new NotFoundError('Objeto no encontrado');
    return (await this.dtos([row.id], baseUrl)).get(row.id)!;
  }
}

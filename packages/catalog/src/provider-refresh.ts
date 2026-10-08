import { catalogImages, catalogItems, type Database } from '@appinity/database';
import { isSourceError, type CatalogProvider } from '@appinity/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Dataset, EntityResolver } from './resolver.js';

export interface ProviderRefreshResult {
  refreshed: number;
  withdrawn: number;
  failed: number;
}

/**
 * Renueva los objetos de catálogo cuyo contenido de proveedor ha caducado (`metadata.providerCache.expiresAt`).
 * Existe por las condiciones de TMDb (§1.C: no cachear más de 6 meses): se vuelve a pedir la ficha y se sobrescribe.
 * Si el proveedor ya no tiene el objeto, se retira su contenido (descripción e imagen) y se conserva el objeto, al
 * que puede apuntar evidencia de usuarios. Un fallo transitorio se reintenta en la siguiente pasada.
 */
export async function refreshExpiredProviderItems(
  db: Database,
  resolver: EntityResolver,
  provider: CatalogProvider,
  options: { dataset?: Dataset; now?: Date; limit?: number } = {},
): Promise<ProviderRefreshResult> {
  const dataset = options.dataset ?? 'live';
  const now = options.now ?? new Date();
  const rows = await db
    .select({ id: catalogItems.id, providerItemId: sql<string>`${catalogItems.metadata}->'providerCache'->>'providerItemId'` })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.dataset, dataset),
        sql`${catalogItems.metadata}->'providerCache'->>'provider' = ${provider.key}`,
        sql`(${catalogItems.metadata}->'providerCache'->>'expiresAt')::timestamptz <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .limit(options.limit ?? 200);

  const result: ProviderRefreshResult = { refreshed: 0, withdrawn: 0, failed: 0 };
  for (const row of rows) {
    if (!row.providerItemId) continue;
    try {
      await resolver.upsertProviderItem(await provider.getItem(row.providerItemId), dataset, provider, { refresh: true });
      result.refreshed += 1;
    } catch (error) {
      if (!(isSourceError(error) && error.code === 'not_found')) {
        result.failed += 1;
        continue;
      }
      await db.transaction(async (tx) => {
        await tx.delete(catalogImages).where(and(eq(catalogImages.catalogItemId, row.id), eq(catalogImages.source, provider.key)));
        await tx
          .update(catalogItems)
          .set({
            description: null,
            metadata: sql`(${catalogItems.metadata} - 'providerCache') || jsonb_build_object('providerWithdrawn', jsonb_build_object('provider', ${provider.key}::text, 'at', ${now.toISOString()}::text))`,
            updatedAt: sql`now()`,
          })
          .where(eq(catalogItems.id, row.id));
      });
      result.withdrawn += 1;
    }
  }
  return result;
}

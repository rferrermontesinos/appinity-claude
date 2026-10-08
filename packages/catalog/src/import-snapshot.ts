import type { Database } from '@appinity/database';
import { EntityResolver, type Dataset } from './resolver.js';
import { WikidataSnapshotProvider } from './providers/wikidata-snapshot.js';

/**
 * Importa toda la instantánea de catálogo (objetos reales) en un dataset. Idempotente: los objetos se
 * localizan por sus IDs externos; con `refresh` se actualizan metadatos e imagen.
 */
export async function importCatalogSnapshot(
  db: Database,
  dataset: Dataset,
  provider = new WikidataSnapshotProvider(),
  options: { refresh?: boolean } = { refresh: true },
): Promise<{ total: number; created: number }> {
  const resolver = new EntityResolver(db, [provider]);
  let created = 0;
  const items = provider.allItems();
  for (const item of items) {
    const result = await resolver.upsertProviderItem(item, dataset, provider, options);
    created += result.created;
  }
  return { total: items.length, created };
}

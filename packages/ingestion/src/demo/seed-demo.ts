import { EntityResolver, WikidataSnapshotProvider, importCatalogSnapshot } from '@appinity/catalog';
import { catalogImages, catalogItems, type DatabaseHandle } from '@appinity/database';
import { createAdapterRegistry, fixture } from '@appinity/integrations';
import { FIXTURE_SOURCE_KEYS } from '@appinity/shared';
import { and, eq, ne } from 'drizzle-orm';
import { connectSource, findOpenConnection } from '../connections.js';
import { createSyncRun, runConnectionSync, type SyncOutcome } from '../sync-runner.js';
import { assertDemoSeedAllowed } from './guard.js';
import { seedDemoUsers } from './seed-users.js';
import { DEMO_USERS } from './users.js';

export interface DemoSeedSummary {
  users: number;
  catalog: { total: number; created: number };
  syncs: Array<{ handle: string; source: string } & Pick<SyncOutcome, 'status' | 'observationsInserted' | 'observationsUpdated' | 'observationsUnchanged' | 'partialErrors'>>;
  pendingImageIds: string[];
}

/**
 * Seed determinista de la demo: usuarios simulados, catálogo real de la instantánea (dataset demo) y, para cada
 * usuario con actividad simulada, conexión a la fuente fixture y sync completo con el mismo pipeline que usará
 * una fuente real. Repetirlo no duplica nada: las observaciones se actualizan por su clave idempotente.
 */
export async function seedDemo(database: DatabaseHandle): Promise<DemoSeedSummary> {
  assertDemoSeedAllowed();
  const db = database.db;
  const users = await seedDemoUsers(db);
  const provider = new WikidataSnapshotProvider();
  const catalog = await importCatalogSnapshot(db, 'demo', provider);
  const registry = createAdapterRegistry({ demoMode: true });
  const resolver = new EntityResolver(db, [provider]);

  const syncs: DemoSeedSummary['syncs'] = [];
  for (const user of DEMO_USERS) {
    for (const source of FIXTURE_SOURCE_KEYS) {
      if (new fixture.FixtureClient(source).recordsFor(user.id).length === 0) continue;
      const connection = (await findOpenConnection(db, user.id, source)) ?? (await connectSource(db, registry, user.id, source));
      const runId = await createSyncRun(database, connection.id, 'seed', 'full');
      const outcome = await runConnectionSync({ database, registry, resolver, pageSize: 25 }, runId);
      syncs.push({
        handle: user.handle,
        source,
        status: outcome.status,
        observationsInserted: outcome.observationsInserted,
        observationsUpdated: outcome.observationsUpdated,
        observationsUnchanged: outcome.observationsUnchanged,
        partialErrors: outcome.partialErrors,
      });
    }
  }

  const pending = await db
    .select({ id: catalogImages.id })
    .from(catalogImages)
    .innerJoin(catalogItems, eq(catalogItems.id, catalogImages.catalogItemId))
    .where(and(eq(catalogItems.dataset, 'demo'), ne(catalogImages.cacheStatus, 'cached')));

  return { users, catalog, syncs, pendingImageIds: pending.map((p) => p.id) };
}

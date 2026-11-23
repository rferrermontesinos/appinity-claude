import {
  catalogItems,
  createDatabase,
  feedback,
  itemVotes,
  notificationDeliveries,
  userConnections,
  userItemObservations,
  userItemProfiles,
  users,
  type DatabaseHandle,
} from '@appinity/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { betaMetrics, createOrResetLocalUser, findOrCreateUserForIdentity, recomputeAffinities, seedDemoUsers, suspendUser } from '../src/index.js';

/**
 * Métricas de la beta (B9) con fechas controladas. Personas SINTÉTICAS (dataset live, «test_metrics_*»):
 * - ana y bea, alta el día 0, almas gemelas entre sí; ana importa a las 2 h y vota el día 8; bea importa a las 30 h y
 *   vota el día 1;
 * - ceci, alta el día 4, sin importar nada; dani, alta el día 9, importa a la hora;
 * - una cuenta sin el alta completa (día 5) y otra suspendida (día 0).
 * Se mide el día 10.
 */
let database: DatabaseHandle;
const id: Record<string, string> = {};
const T0 = Date.UTC(2030, 0, 1, 12);
const day = (n: number, hours = 0) => new Date(T0 + n * 86_400_000 + hours * 3_600_000);
const NOW = day(10);
let seq = 0;

async function item(): Promise<string> {
  const [row] = await database.db
    .insert(catalogItems)
    .values({ dataset: 'live', category: 'movies', itemType: 'movie', title: `Sintético ${++seq}`, normalizedTitle: `sintetico ${seq}`, createdVia: 'test' })
    .returning({ id: catalogItems.id });
  return row!.id;
}

async function imported(user: string, at: Date) {
  const [connection] = await database.db
    .insert(userConnections)
    .values({ userId: id[user]!, sourceKey: 'steam', status: 'active' })
    .returning({ id: userConnections.id });
  await database.db.insert(userItemObservations).values({
    userId: id[user]!,
    catalogItemId: await item(),
    connectionId: connection!.id,
    sourceKey: 'steam',
    sourceRecordId: `r${++seq}`,
    observationKind: 'owned',
    mapperVersion: 'test',
    knownConfidence: 1,
    consumedConfidence: 1,
    contentHash: `h${seq}`,
    firstSyncedAt: at,
    syncedAt: at,
  });
}

async function voted(user: string, at: Date) {
  await database.db.insert(itemVotes).values({ userId: id[user]!, catalogItemId: await item(), value: 1, createdAt: at });
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  for (const [name, created] of [
    ['ana', day(0)],
    ['bea', day(0)],
    ['ceci', day(4)],
    ['dani', day(9)],
    ['suspendida', day(0)],
  ] as const) {
    id[name] = (await createOrResetLocalUser(database.db, { handle: `test_metrics_${name}`, displayName: `Sintética ${name}` })).userId;
    await database.db.update(users).set({ createdAt: created }).where(eq(users.id, id[name]!));
  }
  id.sinalta = (await findOrCreateUserForIdentity(database.db, { provider: 'google', subject: 'sub-test-metrics' }, day(5))).userId;
  await database.db
    .update(users)
    .set({ createdAt: day(5) })
    .where(eq(users.id, id.sinalta));
  await suspendUser(database.db, id.suspendida!, day(1));

  await imported('ana', day(0, 2));
  await imported('bea', day(1, 6));
  await imported('dani', day(9, 1));
  await voted('ana', day(8));
  await voted('ana', day(8, 1));
  await voted('bea', day(1));

  // ana y bea: los mismos gustos (almas gemelas).
  const shared = [await item(), await item(), await item()];
  for (const user of ['ana', 'bea']) {
    for (const catalogItemId of shared) {
      await database.db.insert(userItemProfiles).values({
        userId: id[user]!,
        catalogItemId,
        knownConfidence: 1,
        consumedConfidence: 1,
        preferenceScore: 1,
        preferenceConfidence: 1,
        preferenceBasis: 'explicit_rating',
        evidenceCount: 1,
        sourceCount: 1,
        consolidationVersion: 'test',
      });
    }
  }
  await recomputeAffinities(database.db, { now: day(9) });
  await database.db.insert(notificationDeliveries).values({ userId: id.ana!, kind: 'digest', localDate: '2030-01-10', status: 'sent', createdAt: day(9) });
  await database.db.insert(feedback).values({ userId: id.bea!, message: 'Sintético', appVersion: '0.2.0', platform: 'android', createdAt: day(2) });
});

afterAll(async () => {
  await database?.close();
});

describe('métricas de la beta (pnpm beta:metrics)', () => {
  it('calcula los criterios de cada ola solo con recuentos', async () => {
    const m = await betaMetrics(database.db, { now: NOW });
    expect(m.people).toEqual({ accounts: 6, onboarded: 4, suspended: 1 });
    expect(m.wave1).toEqual({
      importedTastes: { count: 3, of: 4 },
      importedWithin24h: { count: 2, of: 4 },
      medianHoursToFirstImport: 2,
      votedInApp: { count: 2, of: 4 },
    });
    // ana, bea y ceci llevan 48 h; solo ana y bea tienen alma gemela.
    expect(m.wave2.soulmateAfter48h).toEqual({ count: 2, of: 3 });
    const cards = m.wave2.homeCards;
    expect(cards.personal + cards.trending + cards.fallback).toBe(cards.total);
    expect(cards.total).toBeLessThanOrEqual(40);
    // Últimos 7 días: ana, 2 votos en un día. Los 7 anteriores: bea, 1 voto.
    expect(m.wave2.votesPerActiveDay).toEqual({ last7: 2, previous7: 1 });
    // ana y bea llevan 7 días: ana volvió el día 8; bea no hizo nada entre el 7 y el 13.
    expect(m.wave3.retainedDay7).toEqual({ count: 1, of: 2 });
    expect(m.wave3.withLocation).toEqual({ count: 0, of: 4 });
    expect(m.wave3.pushReachedLast7).toBe(1);
    expect(m.pending).toEqual({ reports: 0, feedback: 1 });
    // Ni nombres ni ids: solo números.
    expect(JSON.stringify(m)).not.toMatch(/test_metrics|Sintética|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('--since cuenta solo a quien se dio de alta desde esa fecha, y la demo va aparte', async () => {
    const m = await betaMetrics(database.db, { now: NOW, since: day(3) });
    expect(m.people).toEqual({ accounts: 3, onboarded: 2, suspended: 0 });
    expect(m.wave1.importedTastes).toEqual({ count: 1, of: 2 });
    expect(m.wave3.retainedDay7).toEqual({ count: 0, of: 0 });
    const demo = await betaMetrics(database.db, { dataset: 'demo', now: NOW });
    expect(demo.people.accounts).toBeGreaterThan(0);
    expect(demo.wave1.votedInApp.count).toBe(0);
  });
});

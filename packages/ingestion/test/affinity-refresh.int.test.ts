import { AFFINITY_PARAMS_V1, affinity, indexPreferences, rarityWeight, type PreferencePoint } from '@appinity/algorithms';
import { catalogItems, createDatabase, userAffinities, userItemProfiles, type DatabaseHandle } from '@appinity/database';
import { QUEUES, type AffinityJob, type Category } from '@appinity/shared';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  AFFINITY_REFRESH_DELAY_MS,
  AFFINITY_USER_DELAY_MS,
  createOrResetLocalUser,
  enqueueAffinity,
  itemRarity,
  recomputeAffinities,
  runAffinityJob,
} from '../src/index.js';

/**
 * Fase B7: la rareza de `affinity-v5` al día en todas las parejas. Perfiles SINTÉTICOS (handles «test_rare_*»).
 *
 * Carla y Dani coinciden en dos películas que conoce todo el mundo (c0, c1) y discrepan del todo en dos que solo
 * conocen ellas (r0, r1). Cuando Xavi también puntúa r0 y r1, esas obras dejan de ser tan raras: su desacuerdo pesa
 * menos y la afinidad de Carla y Dani sube, aunque ninguna de las dos haya cambiado nada.
 */
let database: DatabaseHandle;
let connection: Redis;
let queue: Queue<AffinityJob>;
const queues = () => ({ affinity: queue });
const prefix = `appinity-claude-test-b7-${process.pid}`;
const ids: Record<string, string> = {};
const items = new Map<string, string>();

async function item(key: string): Promise<string> {
  const existing = items.get(key);
  if (existing) return existing;
  const [row] = await database.db
    .insert(catalogItems)
    .values({ dataset: 'live', category: 'movies', itemType: 'movie', title: `Sintético ${key}`, normalizedTitle: `sintetico ${key}`, createdVia: 'test' })
    .returning({ id: catalogItems.id });
  items.set(key, row!.id);
  return row!.id;
}

/** Añade preferencias (clave de la obra → puntuación) sin borrar las que ya tenía. */
async function prefer(user: string, prefs: Record<string, number>) {
  for (const [key, score] of Object.entries(prefs)) {
    await database.db.insert(userItemProfiles).values({
      userId: ids[user]!,
      catalogItemId: await item(key),
      knownConfidence: 1,
      consumedConfidence: 1,
      preferenceScore: score,
      preferenceConfidence: 1,
      preferenceBasis: 'explicit_rating',
      evidenceCount: 1,
      sourceCount: 1,
      consolidationVersion: 'test',
    });
  }
}

async function stored(source: string, target: string) {
  const [r] = await database.db
    .select({ score: userAffinities.score, computedAt: userAffinities.computedAt })
    .from(userAffinities)
    .where(and(eq(userAffinities.sourceUserId, ids[source]!), eq(userAffinities.targetUserId, ids[target]!)));
  return r;
}

/** Lo que daría la afinidad con la rareza de AHORA (la misma población que usa «Lo que os une»). */
async function fresh(source: string, target: string): Promise<number | null> {
  const profile = async (user: string) => {
    const rows = await database.db
      .select({ itemId: userItemProfiles.catalogItemId, score: userItemProfiles.preferenceScore, confidence: userItemProfiles.preferenceConfidence })
      .from(userItemProfiles)
      .where(eq(userItemProfiles.userId, ids[user]!));
    return indexPreferences(rows.map((r) => ({ ...r, category: 'movies' as Category }) as PreferencePoint));
  };
  const { population, holders } = await itemRarity(database.db, 'live', [...items.values()]);
  const rarity = new Map([...holders].map(([itemId, n]) => [itemId, rarityWeight(n, population)]));
  return affinity(await profile(source), await profile(target), AFFINITY_PARAMS_V1, rarity).score;
}

async function pending(name: string, userId?: string): Promise<Job<AffinityJob>[]> {
  return (await queue.getDelayed()).filter((j) => j.name === name && j.data.userId === userId);
}

function once(worker: Worker, event: 'active' | 'completed' | 'failed'): Promise<void> {
  return new Promise((resolve) => worker.once(event, () => resolve()));
}

/** Un worker de prueba con su propia conexión (BullMQ no cierra la que se le pasa). */
function startWorker(processor: () => Promise<void>) {
  const workerConnection = new Redis(testEnv().REDIS_URL!, { maxRetriesPerRequest: null });
  const worker = new Worker<AffinityJob>(QUEUES.affinity, processor, { connection: workerConnection, prefix });
  return {
    worker,
    async stop() {
      await worker.close();
      await workerConnection.quit();
    },
  };
}

beforeAll(async () => {
  const env = testEnv();
  database = createDatabase(env.DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  connection = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null });
  queue = new Queue<AffinityJob>(QUEUES.affinity, { connection, prefix });
  await queue.obliterate({ force: true });
  for (const name of ['carla', 'dani', 'eva', 'fede', 'xavi']) {
    ids[name] = (await createOrResetLocalUser(database.db, { handle: `test_rare_${name}`, displayName: `Sintético ${name}` })).userId;
  }
  await prefer('carla', { c0: 1, c1: 1, r0: 1, r1: 1 });
  await prefer('dani', { c0: 1, c1: 1, r0: -1, r1: -1 });
  await prefer('eva', { c0: 1, c1: 1, e0: 1 });
  await prefer('fede', { c0: 1, c1: 1, f0: 1 });
  // Xavi ya es comparable (3 gustos): su cambio no mueve la población, solo cuánta gente conoce r0 y r1.
  await prefer('xavi', { x0: 1, x1: 1, x2: 1 });
});

afterAll(async () => {
  await queue?.obliterate({ force: true }).catch(() => undefined);
  await queue?.close();
  await connection?.quit();
  await database?.close();
});

describe('rareza al día en todas las parejas (B7)', () => {
  it('el parcial deja a las parejas ajenas con los pesos de antes y pide un completo agrupado que las pone al día', async () => {
    await recomputeAffinities(database.db, { now: new Date('2030-01-01T00:00:00Z') });
    const before = (await stored('carla', 'dani'))!;
    expect(before.score).toBeCloseTo((await fresh('carla', 'dani'))!, 2);

    await prefer('xavi', { r0: 1, r1: 1 });
    const partial = await runAffinityJob(database.db, queues(), { userId: ids.xavi! }, { now: new Date('2030-01-02T00:00:00Z') });
    expect(partial.refresh).toBe('scheduled');
    expect(partial.results).toMatchObject([{ dataset: 'live', focusUsers: 1, eligibleUsers: 5 }]);
    // Las parejas de Xavi ya usan la rareza nueva; la de Carla y Dani sigue como estaba.
    expect((await stored('xavi', 'carla'))!.computedAt.toISOString()).toBe('2030-01-02T00:00:00.000Z');
    const stale = (await stored('carla', 'dani'))!;
    expect(stale).toEqual(before);
    const expected = (await fresh('carla', 'dani'))!;
    expect(expected).toBeGreaterThan(before.score + 1);

    // Un solo completo pendiente para todos los cambios que lleguen mientras espera.
    await runAffinityJob(database.db, queues(), { userId: ids.carla! });
    const refresh = await pending('recompute-all');
    expect(refresh).toHaveLength(1);
    expect(refresh[0]!.opts.delay).toBe(AFFINITY_REFRESH_DELAY_MS);

    // Lo que hace el worker con ese trabajo: el completo, que no pide otro.
    const full = await runAffinityJob(database.db, queues(), refresh[0]!.data, { now: new Date('2030-01-03T00:00:00Z') });
    expect(full.refresh).toBeNull();
    const after = (await stored('carla', 'dani'))!;
    expect(after.score).toBeCloseTo(expected, 2);
    expect(after.score).toBe((await stored('dani', 'carla'))!.score);
    expect(after.computedAt.toISOString()).toBe('2030-01-03T00:00:00.000Z');
  });

  it('los cambios de una persona se agrupan, no se pierden si llegan durante el cálculo y un fallo no bloquea los siguientes', async () => {
    await queue.obliterate({ force: true });
    const user = ids.dani!;
    await enqueueAffinity(queues(), user);
    await enqueueAffinity(queues(), user);
    const [first, ...rest] = await pending('recompute', user);
    expect(rest).toHaveLength(0);
    expect(first!.opts.delay).toBe(AFFINITY_USER_DELAY_MS);

    // Un cambio mientras el trabajo se ejecuta se guarda y se encola al terminar.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = startWorker(() => gate);
    let next: Job<AffinityJob> | undefined;
    try {
      const active = once(slow.worker, 'active');
      await first!.promote();
      await active;
      await enqueueAffinity(queues(), user);
      expect(await pending('recompute', user)).toHaveLength(0);
      const completed = once(slow.worker, 'completed');
      release();
      await completed;
      [next] = await pending('recompute', user);
      expect(next).toBeDefined();
      expect(next!.id).not.toBe(first!.id);
    } finally {
      release();
      await slow.stop();
    }

    // Si el trabajo falla del todo, el siguiente cambio vuelve a encolar (con un id fijo, el trabajo fallido lo impedía).
    const failing = startWorker(async () => {
      throw new Error('fallo simulado');
    });
    try {
      const failed = once(failing.worker, 'failed');
      await next!.promote();
      await failed;
    } finally {
      await failing.stop();
    }
    expect(await queue.getJobCountByTypes('failed')).toBe(1);
    await enqueueAffinity(queues(), user);
    const [again] = await pending('recompute', user);
    expect(again).toBeDefined();
    expect(again!.id).not.toBe(next!.id);
  });
});

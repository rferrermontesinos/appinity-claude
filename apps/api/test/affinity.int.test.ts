import type { INestApplication } from '@nestjs/common';
import { createDatabase, userAffinities, userBlocks, users, type DatabaseHandle } from '@appinity/database';
import { DEMO_USERS, recomputeAffinities, seedDemo } from '@appinity/ingestion';
import { CATEGORIES, type AffinityDto, type PublicPersonDto, type RecommendationsDto, type SoulmatesDto } from '@appinity/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

const LIVE_USER_ID = '10000000-0000-4000-a000-0000000000af';

let db: DatabaseHandle;
let app: INestApplication;
let base: string;
let token: string;
const laura = DEMO_USERS[0]!;

async function get(path: string) {
  return fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

beforeAll(async () => {
  const env = testEnv();
  db = createDatabase(env.DATABASE_URL!);
  await truncateAll(db.db);
  await seedDemo(db);
  await recomputeAffinities(db.db);
  await db.db.insert(users).values({ id: LIVE_USER_ID, handle: 'real_afinidad', dataset: 'live' }).onConflictDoNothing();
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const res = await fetch(`${base}/v1/dev/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: laura.handle }) });
  token = ((await res.json()) as { token: string }).token;
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('GET /v1/me/affinities/:userId', () => {
  it('devuelve la afinidad propia hacia cada persona de la demo, con las ocho categorías y NULL donde no hay datos', async () => {
    for (const other of DEMO_USERS.filter((u) => u.id !== laura.id)) {
      const res = await get(`/v1/me/affinities/${other.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as AffinityDto;
      expect(body.categories.map((c) => c.category)).toEqual([...CATEGORIES]);
      const [stored] = await db.db
        .select()
        .from(userAffinities)
        .where(and(eq(userAffinities.sourceUserId, laura.id), eq(userAffinities.targetUserId, other.id)));
      // La API refleja lo calculado: sin fila, NULL (nunca 0 inventado).
      expect(body.score).toBe(stored?.score ?? null);
      expect(body.categoriesCompared).toBe(stored?.categoriesCompared ?? 0);
      expect(body.categories.filter((c) => c.score !== null)).toHaveLength(stored?.categoriesCompared ?? 0);
      // Nunca revela qué objetos coinciden ni la afinidad inversa.
      expect(JSON.stringify(body)).not.toMatch(/itemId|catalogItemId|reverse/);
    }
  });

  it('no se puede consultar a uno mismo, a una cuenta real desde la demo ni a alguien inexistente', async () => {
    expect((await get(`/v1/me/affinities/${laura.id}`)).status).toBe(404);
    expect((await get(`/v1/me/affinities/${LIVE_USER_ID}`)).status).toBe(404);
    expect((await get('/v1/me/affinities/10000000-0000-4000-a000-00000000ffff')).status).toBe(404);
    expect((await get('/v1/me/affinities/no-es-un-uuid')).status).toBe(400);
  });

  it('exige sesión', async () => {
    const res = await fetch(`${base}/v1/me/affinities/${DEMO_USERS[1]!.id}`);
    expect(res.status).toBe(401);
  });
});

describe('almas gemelas y perfil público (fase 6)', () => {
  const byHandle = (handle: string) => DEMO_USERS.find((u) => u.handle === handle)!;

  it('GET /v1/me/soulmates: ranking de la demo con las personas sintéticas, sin el propio usuario', async () => {
    const res = await get('/v1/me/soulmates');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SoulmatesDto;
    expect(body.limit).toBe(50);
    const handles = body.items.map((i) => DEMO_USERS.find((u) => u.id === i.userId)!.handle);
    expect(handles).not.toContain(laura.handle);
    // Clara es la gemela sintética de Laura: primera. Pau (gustos contrarios) queda por debajo de Clara.
    expect(handles[0]).toBe('demo_clara');
    expect(handles.indexOf('demo_pau')).toBeGreaterThan(0);
    expect(body.items[0]!.score).toBeGreaterThan(body.items.find((i) => i.userId === byHandle('demo_pau').id)!.score);
    // Sam no tiene evidencia: no aparece (nunca con un 0 inventado).
    expect(handles).not.toContain('demo_sam');
    expect(JSON.stringify(body)).not.toMatch(/itemId|title|catalog/);
  });

  it('GET /v1/people/:id: perfil mínimo con las 8 afinidades y sin historial', async () => {
    const res = await get(`/v1/people/${byHandle('demo_clara').id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PublicPersonDto;
    expect(Object.keys(body).sort()).toEqual(['affinity', 'avatarUrl', 'countryCode', 'displayName', 'userId']);
    expect(body.displayName).toBe('Clara (demo)');
    expect(body.affinity.categories).toHaveLength(8);
    expect(body.affinity.categories.some((c) => c.score === null)).toBe(true);
  });

  it('un bloqueo en cualquier dirección oculta a la persona del ranking y de su perfil', async () => {
    const clara = byHandle('demo_clara').id;
    await db.db.insert(userBlocks).values({ blockerUserId: clara, blockedUserId: laura.id });
    const body = (await (await get('/v1/me/soulmates')).json()) as SoulmatesDto;
    expect(body.items.map((i) => i.userId)).not.toContain(clara);
    expect((await get(`/v1/people/${clara}`)).status).toBe(404);
    expect((await get(`/v1/me/affinities/${clara}`)).status).toBe(404);
    await db.db.delete(userBlocks);
  });
});

describe('recomendaciones (fase 7)', () => {
  it('GET /v1/me/recommendations: tarjetas con motivo verificable, sin historiales ni ubicaciones ajenas', async () => {
    const res = await get('/v1/me/recommendations?limit=20');
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecommendationsDto;
    expect(body.algorithmVersion).toBe('recommendation-v1');
    expect(body.trending.year).toBe(new Date().getFullYear());
    for (const r of body.items) {
      expect(r.reason.code).toBe(r.block);
      expect(r.item.title).toBeTruthy();
      if (r.block === 'consensus') expect(r.reason.supporters).toBeGreaterThanOrEqual(2);
      if (r.block === 'discovery') expect(r.reason.contributor?.displayName).toBeTruthy();
    }
    // Ninguna tarjeta es algo que Laura ya conoce.
    const known = (await (await get('/v1/me/item-profiles')).json()) as { items?: Array<{ item: { id: string }; knownConfidence: number }> } | Array<{ item: { id: string }; knownConfidence: number }>;
    const list = Array.isArray(known) ? known : (known.items ?? []);
    const knownIds = new Set(list.filter((p) => p.knownConfidence >= 0.8).map((p) => p.item.id));
    expect(knownIds.size).toBeGreaterThan(0);
    expect(body.items.filter((r) => knownIds.has(r.item.id))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/latitude.*voter|voterId|userItemProfiles/);
  });

  it('exclude evita repetir tarjetas de la sesión y los parámetros se validan', async () => {
    const first = (await (await get('/v1/me/recommendations?limit=5')).json()) as RecommendationsDto;
    if (first.items.length) {
      const again = (await (await get(`/v1/me/recommendations?limit=5&exclude=${first.items[0]!.item.id}`)).json()) as RecommendationsDto;
      expect(again.items.map((r) => r.item.id)).not.toContain(first.items[0]!.item.id);
    }
    expect((await get('/v1/me/recommendations?category=inventada')).status).toBe(400);
    expect((await get('/v1/me/recommendations?limit=500')).status).toBe(400);
  });
});

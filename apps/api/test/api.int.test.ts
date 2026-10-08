import type { INestApplication } from '@nestjs/common';
import { createDatabase, type DatabaseHandle, userProfiles, userSettings, users } from '@appinity/database';
import { DEMO_USERS, seedDemoUsers } from '@appinity/ingestion';
import type { HealthDto, MeDto } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

const LIVE_USER_ID = '10000000-0000-4000-a000-000000000001';
const SECRET = testEnv().DEV_AUTH_SECRET!;

async function start(env: Record<string, string>): Promise<{ app: INestApplication; base: string }> {
  const app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return { app, base: `http://127.0.0.1:${address.port}` };
}

async function sign(claims: Record<string, unknown>, opts: { sub: string; secret?: string; exp?: number }) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.sub)
    .setIssuer('appinity-claude-dev')
    .setAudience('appinity-claude-api')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 600)
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

let db: DatabaseHandle;
let app: INestApplication;
let base: string;

async function login(handle: string): Promise<string> {
  const res = await fetch(`${base}/v1/dev/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

function get(path: string, token?: string) {
  return fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

beforeAll(async () => {
  const env = testEnv();
  db = createDatabase(env.DATABASE_URL!);
  await seedDemoUsers(db.db);
  await db.db.insert(users).values({ id: LIVE_USER_ID, handle: 'real_person', dataset: 'live' }).onConflictDoNothing();
  await db.db.insert(userProfiles).values({ userId: LIVE_USER_ID, displayName: 'Real' }).onConflictDoNothing();
  await db.db.insert(userSettings).values({ userId: LIVE_USER_ID }).onConflictDoNothing();
  ({ app, base } = await start(env));
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('health', () => {
  it('responde 200 con base de datos, PostGIS y Redis operativos', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthDto;
    expect(body.status).toBe('ok');
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.postgis.ok).toBe(true);
    expect(body.checks.postgis.detail).toMatch(/PostGIS 3\./);
    expect(body.checks.redis.ok).toBe(true);
    expect(body.mode).toEqual({ environment: 'test', demoMode: true, devAuth: true });
  });
});

describe('rutas privadas', () => {
  it('rechazan peticiones sin sesión', async () => {
    expect((await get('/v1/me')).status).toBe(401);
  });

  it('rechazan tokens mal formados, firmados con otro secreto o caducados', async () => {
    const userId = DEMO_USERS[0]!.id;
    expect((await get('/v1/me', 'abc.def.ghi')).status).toBe(401);
    expect((await get('/v1/me', await sign({ kind: 'dev' }, { sub: userId, secret: 'otro-secreto-distinto-0123456789abcdef' }))).status).toBe(401);
    expect((await get('/v1/me', await sign({ kind: 'dev' }, { sub: userId, exp: Math.floor(Date.now() / 1000) - 10 }))).status).toBe(401);
    expect((await get('/v1/me', await sign({ kind: 'prod' }, { sub: userId }))).status).toBe(401);
  });

  it('la identidad de desarrollo nunca actúa como un usuario real', async () => {
    const forged = await sign({ kind: 'dev' }, { sub: LIVE_USER_ID });
    expect((await get('/v1/me', forged)).status).toBe(401);
    const res = await fetch(`${base}/v1/dev/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'real_person' }),
    });
    expect(res.status).toBe(401);
  });

  it('un usuario suspendido pierde el acceso aunque su token sea válido', async () => {
    const token = await login('demo_jordi');
    const jordi = DEMO_USERS.find((u) => u.handle === 'demo_jordi')!;
    await db.db.update(users).set({ status: 'suspended' }).where(eq(users.id, jordi.id));
    try {
      expect((await get('/v1/me', token)).status).toBe(401);
    } finally {
      await db.db.update(users).set({ status: 'active' }).where(eq(users.id, jordi.id));
    }
  });
});

describe('/v1/me', () => {
  it('devuelve solo los datos del usuario de la sesión', async () => {
    const laura = (await (await get('/v1/me', await login('demo_laura'))).json()) as MeDto;
    const alex = (await (await get('/v1/me', await login('demo_alex'))).json()) as MeDto;
    expect(laura.user.handle).toBe('demo_laura');
    expect(alex.user.handle).toBe('demo_alex');
    expect(laura.user.dataset).toBe('demo');
    expect(laura.authKind).toBe('dev');
  });

  it('valida los ajustes en runtime y redondea la ubicación a una zona aproximada', async () => {
    const token = await login('demo_nuria');
    const patch = (body: unknown) =>
      fetch(`${base}/v1/me/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    expect((await patch({ radiusKm: 0 })).status).toBe(400);
    expect((await patch({ radiusKm: 51 })).status).toBe(400);
    expect((await patch({ radiusKm: 10.5 })).status).toBe(400);
    expect((await patch({ unknownField: true })).status).toBe(400);
    expect((await patch({ timeZone: 'Mars/Olympus' })).status).toBe(400);

    const ok = await patch({
      radiusKm: 25,
      location: { label: 'Prueba', latitude: 41.387654, longitude: 2.168912, source: 'device' },
    });
    expect(ok.status).toBe(200);
    const me = (await ok.json()) as MeDto;
    expect(me.settings.radiusKm).toBe(25);
    expect(me.settings.location).toEqual({ label: 'Prueba', latitude: 41.39, longitude: 2.17, source: 'device' });
  });
});

describe('configuración', () => {
  it('prohíbe DEMO_MODE y la identidad de desarrollo en producción', () => {
    expect(() => loadEnv(testEnv({ NODE_ENV: 'production' }))).toThrow(/prohibidos/);
    expect(() => loadEnv(testEnv({ NODE_ENV: 'production', DEMO_MODE: 'false' }))).toThrow(/prohibidos/);
  });

  it('exige un secreto largo para la identidad de desarrollo', () => {
    expect(() => loadEnv(testEnv({ DEV_AUTH_SECRET: 'corto' }))).toThrow(/32 caracteres/);
  });

  it('sin identidad de desarrollo no hay sesión posible ni listado de usuarios', async () => {
    const disabled = await start(testEnv({ DEV_AUTH_ENABLED: 'false' }));
    try {
      expect((await fetch(`${disabled.base}/v1/dev/users`)).status).toBe(404);
      const token = await sign({ kind: 'dev' }, { sub: DEMO_USERS[0]!.id });
      const res = await fetch(`${disabled.base}/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(401);
    } finally {
      await disabled.app.close();
    }
  });
});

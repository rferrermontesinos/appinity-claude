import type { INestApplication } from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@appinity/database';
import { createOrResetLocalUser, seedDemoUsers } from '@appinity/ingestion';
import type { ConnectStartDto, MeDto, SourceDto } from '@appinity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

const KEY = '0123456789ABCDEF0123456789ABCDEF';
const RETURN_URL = 'exp://192.168.1.16:8091/--/profile';

let database: DatabaseHandle;
let app: INestApplication;
let base: string;
let localCode: string;

async function session(handle: string, code?: string) {
  return fetch(`${base}/v1/dev/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(code === undefined ? { handle } : { handle, code }),
  });
}

async function tokenFor(handle: string, code?: string): Promise<string> {
  const res = await session(handle, code);
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

beforeAll(async () => {
  const env = testEnv({ STEAM_WEB_API_KEY: KEY });
  database = createDatabase(env.DATABASE_URL!);
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  localCode = (await createOrResetLocalUser(database.db, { handle: 'test_local_dani', displayName: 'Dani (simulado)' })).code;
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
});

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe('cuenta local real (identidad de desarrollo)', () => {
  it('exige el código correcto; los usuarios de demo no llevan código', async () => {
    expect((await session('test_local_dani')).status).toBe(401);
    expect((await session('test_local_dani', 'AAAA-BBBB-CCCC')).status).toBe(401);
    expect((await session('demo_laura', localCode)).status).toBe(401);
    const res = await session('test_local_dani', localCode.toLowerCase());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { me: MeDto };
    expect(body.me.user).toMatchObject({ handle: 'test_local_dani', dataset: 'live' });
  });

  it('no aparece en la lista de usuarios de demo', async () => {
    const users = (await (await fetch(`${base}/v1/dev/users`)).json()) as Array<{ handle: string }>;
    expect(users.map((u) => u.handle)).not.toContain('test_local_dani');
  });

  it('regenerar el código invalida las sesiones abiertas', async () => {
    const token = await tokenFor('test_local_dani', localCode);
    expect((await fetch(`${base}/v1/me`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    localCode = (await createOrResetLocalUser(database.db, { handle: 'test_local_dani', displayName: 'Dani (simulado)' })).code;
    expect((await fetch(`${base}/v1/me`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
  });
});

describe('conexión con Steam desde la API', () => {
  it('un usuario real ve Steam conectable y las fuentes simuladas no', async () => {
    const token = await tokenFor('test_local_dani', localCode);
    const sources = (await (await fetch(`${base}/v1/sources`, { headers: { Authorization: `Bearer ${token}` } })).json()) as SourceDto[];
    expect(sources.find((s) => s.key === 'steam')).toMatchObject({ connectable: true, availability: 'available' });
    expect(sources.filter((s) => s.simulated).every((s) => !s.connectable)).toBe(true);
  });

  it('iniciar devuelve la URL de Steam con return_to en esta API y un state de un solo uso', async () => {
    const token = await tokenFor('test_local_dani', localCode);
    const res = await fetch(`${base}/v1/me/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sourceKey: 'steam', returnUrl: RETURN_URL }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ConnectStartDto;
    expect(body.kind).toBe('redirect');
    const url = new URL((body as { authorizationUrl: string }).authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://steamcommunity.com/openid/login');
    const returnTo = new URL(url.searchParams.get('openid.return_to')!);
    // El state va en la ruta (sin query propia: los proveedores añaden la suya).
    const [, state] = /^\/v1\/connect\/steam\/callback\/([A-Za-z0-9_-]+)$/.exec(returnTo.pathname) ?? [];
    expect(state).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(returnTo.search).toBe('');

    // Una respuesta sin datos OpenID se rechaza y vuelve a la app con el error.
    const callback = await fetch(`${base}/v1/connect/steam/callback/${state}`, { redirect: 'manual' });
    expect(callback.status).toBe(302);
    const back = new URL(callback.headers.get('location')!);
    expect(back.protocol).toBe('exp:');
    expect(back.searchParams.get('result')).toBe('error');
    // El state ya se consumió: reutilizarlo no sirve (tampoco con la forma antigua ?state=).
    const replay = await fetch(`${base}/v1/connect/steam/callback?state=${state}`, { redirect: 'manual' });
    expect(replay.status).toBe(400);
    expect(await replay.text()).toMatch(/caducado o ya se usó/);
  });

  it('rechaza URLs de vuelta fuera de la lista blanca (sin redirecciones abiertas)', async () => {
    const token = await tokenFor('test_local_dani', localCode);
    for (const returnUrl of ['https://evil.example/cb', 'exp://8.8.8.8:8081/--/x', 'javascript:alert(1)']) {
      const res = await fetch(`${base}/v1/me/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceKey: 'steam', returnUrl }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('un callback con state inventado no crea nada', async () => {
    const res = await fetch(`${base}/v1/connect/steam/callback?state=inventado-0123456789abcdef`, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });

  it('un usuario de demo no puede iniciar la conexión con Steam', async () => {
    const token = await tokenFor('demo_laura');
    const res = await fetch(`${base}/v1/me/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sourceKey: 'steam', returnUrl: RETURN_URL }),
    });
    expect(res.status).toBe(403);
  });
});

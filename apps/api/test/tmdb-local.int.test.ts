import type { INestApplication } from '@nestjs/common';
import { createDatabase, sourceCredentials, userConnections, users, type DatabaseHandle } from '@appinity/database';
import { createOrResetLocalUser, seedDemoUsers } from '@appinity/ingestion';
import { tmdbFixtures } from '@appinity/integrations';
import type { ConnectStartDto, ConnectionDto, DisconnectResultDto, SourceDto } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

const RETURN_URL = 'exp://192.168.1.16:8091/--/profile';
/** Token con forma de JWT pero SIMULADO: el TMDb falso solo acepta ese. */
const { SIMULATED_TMDB_READ_TOKEN, createFakeTmdbFetch } = tmdbFixtures;

let database: DatabaseHandle;
let app: INestApplication;
let base: string;
const codes: Record<string, string> = {};
const fake = createFakeTmdbFetch();
const realFetch = globalThis.fetch;

async function tokenFor(handle: string): Promise<string> {
  const res = await realFetch(`${base}/v1/dev/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(codes[handle] ? { handle, code: codes[handle] } : { handle }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  return realFetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

async function startTmdb(token: string) {
  const res = await api(token, '/v1/me/connections', { method: 'POST', body: JSON.stringify({ sourceKey: 'tmdb', returnUrl: RETURN_URL }) });
  expect(res.status).toBe(201);
  const body = (await res.json()) as ConnectStartDto & { kind: 'redirect' };
  const url = new URL(body.authorizationUrl);
  const requestToken = url.pathname.split('/').at(-1)!;
  return { url, requestToken, redirectTo: new URL(url.searchParams.get('redirect_to')!) };
}

beforeAll(async () => {
  // Las llamadas del servidor a api.themoviedb.org van al TMDb simulado; el resto, a la red local real.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    return url.hostname === 'api.themoviedb.org' ? fake.fetchImpl(input, init) : realFetch(input, init);
  }) as typeof fetch;
  const env = testEnv({ TMDB_API_READ_TOKEN: SIMULATED_TMDB_READ_TOKEN });
  database = createDatabase(env.DATABASE_URL!);
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  for (const handle of ['test_tmdb_gala', 'test_tmdb_hugo']) {
    codes[handle] = (await createOrResetLocalUser(database.db, { handle, displayName: `${handle} (simulado)` })).code;
  }
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await app?.close();
  await database?.close();
});

describe('configuración de TMDb', () => {
  it('rechaza la «API Key» corta en lugar del «API Read Access Token»', () => {
    expect(() => loadEnv(testEnv({ TMDB_API_READ_TOKEN: '0123456789abcdef0123456789abcdef' }))).toThrow(/API Read Access Token/);
  });
});

describe('conexión con TMDb desde la API', () => {
  it('un usuario real ve TMDb conectable', async () => {
    const token = await tokenFor('test_tmdb_gala');
    const sources = (await (await api(token, '/v1/sources')).json()) as SourceDto[];
    expect(sources.find((s) => s.key === 'tmdb')).toMatchObject({ connectable: true, availability: 'available', simulated: false });
  });

  it('flujo completo: aprobar en TMDb vuelve a la app conectada y la sesión nunca sale del servidor', async () => {
    const token = await tokenFor('test_tmdb_gala');
    fake.calls.length = 0;
    const { url, requestToken, redirectTo } = await startTmdb(token);
    expect(url.origin).toBe('https://www.themoviedb.org');
    expect(url.pathname).toBe(`/authenticate/${requestToken}`);
    // La vuelta lleva el state en la ruta y ninguna query propia (TMDb añade la suya).
    expect(redirectTo.pathname).toMatch(/^\/v1\/connect\/tmdb\/callback\/[A-Za-z0-9_-]{30,}$/);
    expect(redirectTo.search).toBe('');
    // El servidor se autentica ante TMDb con el token de la APLICACIÓN; el cliente nunca lo ve.
    expect(fake.calls[0]).toMatchObject({ path: '/3/authentication/token/new', authorization: `Bearer ${SIMULATED_TMDB_READ_TOKEN}` });

    fake.approve(requestToken);
    const callback = await realFetch(`${redirectTo.href}?request_token=${requestToken}&approved=true`, { redirect: 'manual' });
    expect(callback.status).toBe(302);
    const back = new URL(callback.headers.get('location')!);
    expect(back.protocol).toBe('exp:');
    expect(back.searchParams.get('result')).toBe('connected');

    const listRes = await api(token, '/v1/me/connections');
    const raw = await listRes.text();
    const [session] = [...fake.sessions];
    expect(raw).not.toContain(session);
    const tmdb = (JSON.parse(raw) as ConnectionDto[]).find((c) => c.sourceKey === 'tmdb');
    expect(tmdb).toMatchObject({ status: 'active', externalAccountHint: 'Cuenta TMDb …0001' });
    const [stored] = await database.db.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, tmdb!.id));
    expect(stored!.ciphertext).not.toContain(session);
  });

  it('si el usuario deniega el acceso vuelve a la app con el error y no crea nada', async () => {
    const token = await tokenFor('test_tmdb_hugo');
    const { requestToken, redirectTo } = await startTmdb(token);
    const callback = await realFetch(`${redirectTo.href}?request_token=${requestToken}&denied=true`, { redirect: 'manual' });
    const back = new URL(callback.headers.get('location')!);
    expect(back.searchParams.get('result')).toBe('error');
    expect(back.searchParams.get('message')).toMatch(/denegó/);
    const rows = await database.db
      .select({ id: userConnections.id })
      .from(userConnections)
      .innerJoin(users, eq(users.id, userConnections.userId))
      .where(eq(users.handle, 'test_tmdb_hugo'));
    expect(rows).toHaveLength(0);
  });

  it('una vuelta con otro request token no se acepta', async () => {
    const token = await tokenFor('test_tmdb_hugo');
    const { requestToken, redirectTo } = await startTmdb(token);
    fake.approve(requestToken);
    const callback = await realFetch(`${redirectTo.href}?request_token=otro-token-0123456789&approved=true`, { redirect: 'manual' });
    expect(new URL(callback.headers.get('location')!).searchParams.get('result')).toBe('error');
  });

  it('desconectar revoca la sesión también en TMDb y lo comunica', async () => {
    const token = await tokenFor('test_tmdb_gala');
    const connections = (await (await api(token, '/v1/me/connections')).json()) as ConnectionDto[];
    const tmdb = connections.find((c) => c.sourceKey === 'tmdb')!;
    const [session] = [...fake.sessions];
    const res = await api(token, `/v1/me/connections/${tmdb.id}?purge=true`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()) as DisconnectResultDto).toMatchObject({ providerRevocation: 'revoked' });
    expect(fake.deletedSessions).toContain(session);
  });

  it('otro usuario no puede desconectar una conexión ajena', async () => {
    const gala = await tokenFor('test_tmdb_gala');
    const connections = (await (await api(gala, '/v1/me/connections')).json()) as ConnectionDto[];
    const hugo = await tokenFor('test_tmdb_hugo');
    const res = await api(hugo, `/v1/me/connections/${connections[0]!.id}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

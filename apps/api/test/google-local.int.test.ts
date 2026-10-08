import type { INestApplication } from '@nestjs/common';
import { createDatabase, sourceCredentials, type DatabaseHandle } from '@appinity/database';
import { createOrResetLocalUser, seedDemoUsers } from '@appinity/ingestion';
import { googleFixtures } from '@appinity/integrations';
import type { ConnectStartDto, ConnectionDto, DisconnectResultDto, SourceDto } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

/** Vista web de desarrollo en el PC: en desarrollo Google solo vuelve a localhost. */
const RETURN_URL = 'http://localhost:8092/profile';
const { FAKE_CLIENT, createFakeGoogle } = googleFixtures;

let database: DatabaseHandle;
let app: INestApplication;
let base: string;
let code: string;
const google = createFakeGoogle();
const realFetch = globalThis.fetch;

async function token(): Promise<string> {
  const res = await realFetch(`${base}/v1/dev/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: 'test_google_hugo', code }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function api(path: string, init: RequestInit = {}) {
  return realFetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
  });
}

async function startGoogle() {
  const res = await api('/v1/me/connections', { method: 'POST', body: JSON.stringify({ sourceKey: 'google_portability', returnUrl: RETURN_URL }) });
  expect(res.status).toBe(201);
  return (await res.json()) as ConnectStartDto & { kind: 'redirect' };
}

beforeAll(async () => {
  // Las llamadas del servidor a Google van al Google simulado; el resto, a la red local real.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const host = new URL(input instanceof Request ? input.url : input.toString()).hostname;
    return host.endsWith('googleapis.com') ? google.fetchImpl(input, init) : realFetch(input, init);
  }) as typeof fetch;
  const env = testEnv({ GOOGLE_OAUTH_CLIENT_ID: FAKE_CLIENT.clientId, GOOGLE_OAUTH_CLIENT_SECRET: FAKE_CLIENT.clientSecret });
  database = createDatabase(env.DATABASE_URL!);
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  code = (await createOrResetLocalUser(database.db, { handle: 'test_google_hugo', displayName: 'Hugo (simulado)' })).code;
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await app?.close();
  await database?.close();
});

describe('conexión con Google desde la API', () => {
  it('un usuario real ve Google conectable y renovable', async () => {
    const sources = (await (await api('/v1/sources')).json()) as SourceDto[];
    expect(sources.find((s) => s.key === 'google_portability')).toMatchObject({ connectable: true, supportsRenewal: true, availability: 'available' });
  });

  it('flujo completo: el consentimiento vuelve con state y code, se crea la conexión y el token nunca sale del servidor', async () => {
    const start = await startGoogle();
    expect(start).toMatchObject({ kind: 'redirect', localOnly: true });
    const url = new URL(start.authorizationUrl);
    expect(url.host).toBe('accounts.google.com');
    const state = url.searchParams.get('state')!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    // La URL de vuelta es la registrada en Google, sin el state (Google lo devuelve como parámetro).
    expect(url.searchParams.get('redirect_uri')).toBe(FAKE_CLIENT.redirectUri);

    const authCode = google.approve(start.authorizationUrl);
    const callback = await realFetch(`${base}/v1/connect/google_portability/callback?state=${state}&code=${authCode}&scope=x`, { redirect: 'manual' });
    expect(callback.status).toBe(302);
    const back = new URL(callback.headers.get('location')!);
    expect(back.origin + back.pathname).toBe(RETURN_URL);
    expect(back.searchParams.get('result')).toBe('connected');

    const raw = await (await api('/v1/me/connections')).text();
    expect(raw).not.toContain('refresh-simulado');
    const connection = (JSON.parse(raw) as ConnectionDto[]).find((c) => c.sourceKey === 'google_portability');
    expect(connection).toMatchObject({ status: 'active', externalAccountHint: null });
    const [stored] = await database.db.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, connection!.id));
    expect(stored!.ciphertext).not.toContain('refresh-simulado');
  });

  it('cancelar la renovación en Google vuelve a la app con el error y no toca la conexión', async () => {
    const start = await startGoogle();
    expect(start.renewal).toBe(true);
    const state = new URL(start.authorizationUrl).searchParams.get('state')!;
    const callback = await realFetch(`${base}/v1/connect/google_portability/callback?state=${state}&error=access_denied`, { redirect: 'manual' });
    const back = new URL(callback.headers.get('location')!);
    expect(back.searchParams.get('result')).toBe('error');
    expect(back.searchParams.get('message')).toMatch(/cancel/);
    const connections = (await (await api('/v1/me/connections')).json()) as ConnectionDto[];
    expect(connections.find((c) => c.sourceKey === 'google_portability')).toMatchObject({ status: 'active' });
  });

  it('desconectar revoca el permiso en Google y lo comunica', async () => {
    const connections = (await (await api('/v1/me/connections')).json()) as ConnectionDto[];
    const google_ = connections.find((c) => c.sourceKey === 'google_portability')!;
    const res = await api(`/v1/me/connections/${google_.id}?purge=true`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()) as DisconnectResultDto).toMatchObject({ providerRevocation: 'revoked' });
    expect(google.resets()).toBe(1);
  });
});

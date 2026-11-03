import type { INestApplication } from '@nestjs/common';
import { createDatabase, sourceSyncRuns, userConnections, type DatabaseHandle } from '@appinity/database';
import { createSession, findOrCreateUserForIdentity } from '@appinity/ingestion';
import { googleFixtures } from '@appinity/integrations';
import type { AuthSessionDto, InitialImportDto } from '@appinity/shared';
import { eq, inArray } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';
import { ConnectionsService } from '../dist/connections/connections.service.js';

/** Alta única: nada se importa antes de aceptar las condiciones; al aceptar, empieza todo lo de Google de una vez. */
const RETURN_URL = 'http://localhost:8092/profile';
const AUTH_SECRET = 'secreto-de-sesion-solo-para-tests-0123456789';
const { FAKE_CLIENT } = googleFixtures;
const env = testEnv({ AUTH_SECRET, GOOGLE_OAUTH_CLIENT_ID: FAKE_CLIENT.clientId, GOOGLE_OAUTH_CLIENT_SECRET: FAKE_CLIENT.clientSecret });
let db: DatabaseHandle;
let app: INestApplication;
let base: string;
let redis: Redis;

beforeAll(async () => {
  db = createDatabase(env.DATABASE_URL!);
  await truncateAll(db.db);
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  redis = new Redis(env.REDIS_URL!);
});

afterAll(async () => {
  await redis?.quit();
  await app?.close();
  await db?.close();
});

const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

/** Lo que dejaría la vuelta de «Continuar con Google»: cuenta nueva sin alta y una sesión. */
async function newGoogleUser(subject: string): Promise<{ userId: string; token: string }> {
  const { userId, isNew } = await findOrCreateUserForIdentity(db.db, { provider: 'google', subject, email: `${subject}@example.com`, name: 'Prueba' });
  const session = await createSession(db.db, userId);
  const code = `codigo-de-prueba-${subject}-0123456789`;
  await redis.set(`${env.QUEUE_PREFIX}:auth-handoff:${code}`, JSON.stringify({ userId, sessionId: session.sessionId, refreshToken: session.refreshToken, isNew }), 'EX', 60);
  const dto = (await (await call('POST', '/v1/auth/exchange', undefined, { code })).json()) as AuthSessionDto;
  return { userId, token: dto.accessToken };
}

async function runsOf(userId: string) {
  const ids = (await db.db.select({ id: userConnections.id }).from(userConnections).where(eq(userConnections.userId, userId))).map((r) => r.id);
  return ids.length ? db.db.select().from(sourceSyncRuns).where(inArray(sourceSyncRuns.connectionId, ids)) : [];
}

describe('alta única con importación de Google', () => {
  it('antes de aceptar las condiciones no se importa ni se conecta nada; al aceptar arranca Books y se encadena Data Portability', async () => {
    const { userId, token } = await newGoogleUser('sub-alta-unica');
    const connections = app.get(ConnectionsService);

    // Books concedido en el inicio de sesión: la conexión se guarda, pero sin sync (no hay consentimiento aún).
    await connections.attachGoogleBooks(userId, { access_token: 'token-simulado', refresh_token: 'refresh-simulado', expires_in: 3600, scope: 'https://www.googleapis.com/auth/books' });
    expect(await runsOf(userId)).toHaveLength(0);

    // Ni conectar otra fuente ni la importación inicial antes del alta.
    expect((await call('POST', '/v1/me/connections', token, { sourceKey: 'google_portability', returnUrl: RETURN_URL })).status).toBeGreaterThanOrEqual(400);
    expect((await call('POST', '/v1/me/connections/initial-import', token, { returnUrl: RETURN_URL })).status).toBeGreaterThanOrEqual(400);
    expect(await runsOf(userId)).toHaveLength(0);

    // Alta: condiciones aceptadas → arranca el primer sync de Books y vuelve el consentimiento de Data Portability.
    expect((await call('POST', '/v1/me/onboarding', token, { adult: true, termsAccepted: true })).status).toBe(204);
    const res = await call('POST', '/v1/me/connections/initial-import', token, { returnUrl: RETURN_URL });
    expect(res.status).toBe(201);
    const first = (await res.json()) as InitialImportDto;
    expect(first.started).toBe(1);
    expect(first.next).toMatchObject({ kind: 'redirect' });
    expect(first.next?.kind === 'redirect' ? first.next.authorizationUrl : '').toContain('dataportability');
    expect(await runsOf(userId)).toHaveLength(1);

    // Repetir no duplica el primer sync; Data Portability sigue pendiente hasta que se autorice.
    const again = (await (await call('POST', '/v1/me/connections/initial-import', token, { returnUrl: RETURN_URL })).json()) as InitialImportDto;
    expect(again.started).toBe(0);
    expect(again.next).toMatchObject({ kind: 'redirect' });
    expect(await runsOf(userId)).toHaveLength(1);
  });

  it('una URL de vuelta ajena se rechaza', async () => {
    const { token } = await newGoogleUser('sub-alta-url');
    await call('POST', '/v1/me/onboarding', token, { adult: true, termsAccepted: true });
    expect((await call('POST', '/v1/me/connections/initial-import', token, { returnUrl: 'https://malicioso.example/x' })).status).toBe(400);
  });
});

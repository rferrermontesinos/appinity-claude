import type { INestApplication } from '@nestjs/common';
import { authSessions, createDatabase, users, type DatabaseHandle } from '@appinity/database';
import { createSession, findOrCreateUserForIdentity } from '@appinity/ingestion';
import type { AuthProvidersDto, AuthSessionDto, MeDto } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { GoogleOidc } from '../dist/auth/google-oidc.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

/** Valores SOLO de test (no reales). */
const AUTH_SECRET = 'secreto-de-sesion-solo-para-tests-0123456789';
const CLIENT_ID = '123456789012-simulado.apps.googleusercontent.com';
let db: DatabaseHandle;
let app: INestApplication;
let base: string;
let redis: Redis;
const env = testEnv({ AUTH_SECRET, GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-simulado-no-es-real-0123456789' });

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

/** Simula la vuelta de Google: lo que dejaría el callback tras verificar el ID token (identidad + sesión + código). */
async function handoff(subject: string): Promise<{ code: string; userId: string }> {
  const { userId, isNew } = await findOrCreateUserForIdentity(db.db, { provider: 'google', subject, email: `${subject}@example.com`, name: 'Prueba' });
  const session = await createSession(db.db, userId);
  const code = `codigo-de-prueba-${subject}-0123456789`;
  await redis.set(`${env.QUEUE_PREFIX}:auth-handoff:${code}`, JSON.stringify({ userId, sessionId: session.sessionId, refreshToken: session.refreshToken, isNew }), 'EX', 60);
  return { code, userId };
}

describe('OpenID Connect de Google (claves locales, sin red)', () => {
  it('pide openid email profile con PKCE y nonce, sin prompt; verifica firma, emisor, audiencia, caducidad y nonce', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
    const oidc = new GoogleOidc({ clientId: CLIENT_ID, clientSecret: 'x', redirectUri: 'http://localhost:3100/v1/auth/google/callback', jwks });
    const { url, pending } = oidc.start('estado-0123456789abcdef');
    const params = new URL(url).searchParams;
    expect(params.get('scope')).toBe('openid email profile');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('nonce')).toBe(pending.nonce);
    expect(params.has('prompt')).toBe(false);

    const sign = (claims: Record<string, unknown>, exp = '5m', audience = CLIENT_ID) =>
      new SignJWT({ nonce: pending.nonce, email: 'Ana@Example.com', email_verified: true, given_name: 'Ana', ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject('google-sub-1')
        .setIssuer('https://accounts.google.com')
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(privateKey);
    expect(await oidc.verifyIdToken(await sign({}), pending.nonce)).toEqual({ subject: 'google-sub-1', email: 'ana@example.com', name: 'Ana' });
    await expect(oidc.verifyIdToken(await sign({ nonce: 'otro' }), pending.nonce)).rejects.toThrow(/nonce/);
    await expect(oidc.verifyIdToken(await sign({}, '5m', 'otro-cliente'), pending.nonce)).rejects.toThrow();
    await expect(oidc.verifyIdToken(await sign({}, '-1m'), pending.nonce)).rejects.toThrow();
    // Email no verificado: no se guarda.
    expect(await oidc.verifyIdToken(await sign({ email_verified: false }), pending.nonce)).toEqual({ subject: 'google-sub-1', name: 'Ana' });
  });
});

describe('sesiones de producción (fase 13)', () => {
  it('proveedores disponibles y vuelta de Google solo a URLs permitidas', async () => {
    expect(await (await call('GET', '/v1/auth/providers')).json()).toEqual<AuthProvidersDto>({ google: true, dev: true });
    expect((await call('GET', '/v1/auth/google/start?returnUrl=https%3A%2F%2Fmalicioso.example')).status).toBe(400);
    const start = await call('GET', '/v1/auth/google/start?returnUrl=appinity-claude%3A%2F%2Fprofile');
    expect(start.status).toBe(302);
    expect(start.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    // Vuelta con un state desconocido: rechazada.
    expect((await call('GET', '/v1/auth/google/callback?state=estado-inventado-0123456789&code=x')).status).toBe(400);
  });

  it('código de un solo uso → sesión; alta; renovación con rotación; cierre de sesión', async () => {
    const { code } = await handoff('sub-ana');
    const session = (await (await call('POST', '/v1/auth/exchange', undefined, { code })).json()) as AuthSessionDto;
    expect(session).toMatchObject({ isNew: true, needsOnboarding: true });
    expect((await call('POST', '/v1/auth/exchange', undefined, { code })).status).toBe(401);

    let me = (await (await call('GET', '/v1/me', session.accessToken)).json()) as MeDto;
    expect(me).toMatchObject({ authKind: 'user', needsOnboarding: true, user: { dataset: 'live' } });
    expect((await call('POST', '/v1/me/onboarding', session.accessToken, { adult: false, termsAccepted: true })).status).toBe(400);
    expect((await call('POST', '/v1/me/onboarding', session.accessToken, { adult: true, termsAccepted: true, displayName: 'Ana' })).status).toBe(204);
    me = (await (await call('GET', '/v1/me', session.accessToken)).json()) as MeDto;
    expect(me).toMatchObject({ needsOnboarding: false, user: { displayName: 'Ana' } });

    const rotated = (await (await call('POST', '/v1/auth/refresh', undefined, { refreshToken: session.refreshToken })).json()) as AuthSessionDto;
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect((await call('POST', '/v1/auth/refresh', undefined, { refreshToken: session.refreshToken })).status).toBe(401);

    expect((await call('POST', '/v1/auth/logout', rotated.accessToken)).status).toBe(204);
    expect((await call('GET', '/v1/me', rotated.accessToken)).status).toBe(401);
    expect((await call('POST', '/v1/auth/refresh', undefined, { refreshToken: rotated.refreshToken })).status).toBe(401);
  });

  it('la misma identidad de Google vuelve a la misma cuenta', async () => {
    const first = await handoff('sub-bea');
    const second = await handoff('sub-bea');
    expect(second.userId).toBe(first.userId);
  });

  it('eliminar la cuenta borra al usuario y cierra todas sus sesiones', async () => {
    const { code, userId } = await handoff('sub-carla');
    const session = (await (await call('POST', '/v1/auth/exchange', undefined, { code })).json()) as AuthSessionDto;
    expect((await call('DELETE', '/v1/me', session.accessToken, { confirm: 'no' })).status).toBe(400);
    expect((await call('DELETE', '/v1/me', session.accessToken, { confirm: 'ELIMINAR' })).status).toBe(204);
    expect(await db.db.select().from(users).where(eq(users.id, userId))).toEqual([]);
    expect(await db.db.select().from(authSessions).where(eq(authSessions.userId, userId))).toEqual([]);
    expect((await call('GET', '/v1/me', session.accessToken)).status).toBe(401);
  });
});

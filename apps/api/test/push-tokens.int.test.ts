import type { INestApplication } from '@nestjs/common';
import { createDatabase, pushTokens, type DatabaseHandle } from '@appinity/database';
import { createOrResetLocalUser } from '@appinity/ingestion';
import type { NotificationsStatusDto } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

/**
 * Registro del teléfono para las notificaciones (lo que hace la app en la fase B6). Personas SINTÉTICAS: cuentas
 * locales «test_push_*». Ningún test envía notificaciones de verdad.
 */
let db: DatabaseHandle;
let app: INestApplication;
let base: string;
const tokens: Record<'ana' | 'bea', string> = { ana: '', bea: '' };
const DEVICE = 'ExponentPushToken[test-dispositivo-0123456789]';

async function login(handle: string, code: string): Promise<string> {
  const res = await fetch(`${base}/v1/dev/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, code }),
  });
  return ((await res.json()) as { token: string }).token;
}

beforeAll(async () => {
  const env = testEnv();
  db = createDatabase(env.DATABASE_URL!, { max: 2 });
  await truncateAll(db.db);
  const ana = await createOrResetLocalUser(db.db, { handle: 'test_push_ana', displayName: 'Sintética Ana' });
  const bea = await createOrResetLocalUser(db.db, { handle: 'test_push_bea', displayName: 'Sintética Bea' });
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  tokens.ana = await login('test_push_ana', ana.code);
  tokens.bea = await login('test_push_bea', bea.code);
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

const call = (method: 'POST' | 'DELETE', body: unknown, who?: 'ana' | 'bea') =>
  fetch(`${base}/v1/me/push-tokens`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: JSON.stringify(body),
  });

const status = async (who: 'ana' | 'bea') =>
  (await (await fetch(`${base}/v1/me/notifications`, { headers: { Authorization: `Bearer ${tokens[who]}` } })).json()) as NotificationsStatusDto;

describe('registro del teléfono (POST/DELETE /v1/me/push-tokens)', () => {
  it('sin sesión: 401', async () => {
    expect(tokens.ana && tokens.bea).toBeTruthy();
    expect((await call('POST', { token: DEVICE, platform: 'android' })).status).toBe(401);
    expect((await call('DELETE', { token: DEVICE })).status).toBe(401);
    expect((await fetch(`${base}/v1/me/notifications`)).status).toBe(401);
  });

  it('rechaza plataformas, campos y tokens que no son de Expo', async () => {
    expect((await call('POST', { token: DEVICE, platform: 'web' }, 'ana')).status).toBe(400);
    expect((await call('POST', { token: DEVICE, platform: 'android', userId: 'otra-persona' }, 'ana')).status).toBe(400);
    expect((await call('POST', { token: 'corto', platform: 'android' }, 'ana')).status).toBe(400);
    expect((await call('POST', { token: 'fcm:0123456789abcdef', platform: 'android' }, 'ana')).status).toBe(409);
    expect(await db.db.select().from(pushTokens)).toEqual([]);
  });

  it('registra el teléfono una sola vez aunque la app lo repita en cada arranque', async () => {
    expect((await call('POST', { token: DEVICE, platform: 'android' }, 'ana')).status).toBe(204);
    expect((await call('POST', { token: DEVICE, platform: 'android' }, 'ana')).status).toBe(204);
    expect(await status('ana')).toEqual({ devices: 1, lastDelivery: null });
  });

  it('si en el teléfono entra otra cuenta, el token pasa a ella', async () => {
    expect((await call('POST', { token: DEVICE, platform: 'android' }, 'bea')).status).toBe(204);
    expect((await status('ana')).devices).toBe(0);
    expect((await status('bea')).devices).toBe(1);
  });

  it('al cerrar sesión solo lo quita su dueña', async () => {
    // Ana ya no es la dueña: su DELETE no toca el teléfono de Bea.
    expect((await call('DELETE', { token: DEVICE }, 'ana')).status).toBe(204);
    expect((await status('bea')).devices).toBe(1);
    expect((await call('DELETE', { token: DEVICE }, 'bea')).status).toBe(204);
    expect((await status('bea')).devices).toBe(0);
    expect(await db.db.select().from(pushTokens).where(eq(pushTokens.token, DEVICE))).toEqual([]);
  });
});

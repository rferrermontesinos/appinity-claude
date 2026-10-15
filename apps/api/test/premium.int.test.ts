import type { INestApplication } from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@appinity/database';
import { DEMO_USERS, seedDemo } from '@appinity/ingestion';
import type { ChatConfigDto, PremiumDto, SoulmatesDto } from '@appinity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

/** Secreto SOLO de test (no es real). RevenueCat enviaría exactamente este valor en Authorization. */
const WEBHOOK_AUTH = 'Bearer secreto-de-test-no-real-0123456789';
let db: DatabaseHandle;
let app: INestApplication;
let base: string;
let token: string;
const laura = DEMO_USERS[0]!;

beforeAll(async () => {
  const env = testEnv();
  db = createDatabase(env.DATABASE_URL!);
  await truncateAll(db.db);
  await seedDemo(db);
  app = await createApp(loadEnv({ ...env, REVENUECAT_WEBHOOK_AUTH: WEBHOOK_AUTH }), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const res = await fetch(`${base}/v1/dev/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: laura.handle }) });
  token = ((await res.json()) as { token: string }).token;
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

const me = async <T>(path: string) => (await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })).json() as Promise<T>;
const hook = (body: unknown, authorization = WEBHOOK_AUTH) =>
  fetch(`${base}/v1/webhooks/revenuecat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization }, body: JSON.stringify(body) });

describe('Premium (fase 12B)', () => {
  it('sin compra: no es Premium y el ranking es el gratuito (50)', async () => {
    expect(await me<PremiumDto>('/v1/me/premium')).toMatchObject({ premium: false, environment: 'sandbox', webhookConfigured: true, purchasesInApp: false });
    expect((await me<SoulmatesDto>('/v1/me/soulmates')).limit).toBe(50);
  });

  it('webhook: rechaza una cabecera incorrecta y aplica una compra de sandbox una sola vez', async () => {
    const purchase = {
      event: {
        id: 'evt-http-1',
        type: 'INITIAL_PURCHASE',
        app_user_id: laura.id,
        entitlement_ids: ['premium'],
        product_id: 'appinity_premium_monthly',
        expiration_at_ms: Date.now() + 30 * 24 * 3600_000,
        event_timestamp_ms: Date.now(),
        environment: 'SANDBOX',
      },
      api_version: '1.0',
    };
    expect((await hook(purchase, 'Bearer otra-cosa')).status).toBe(401);
    expect((await hook({ nada: true })).status).toBe(400);
    expect(await (await hook(purchase)).json()).toEqual({ ok: true, outcome: 'applied' });
    expect(await (await hook(purchase)).json()).toEqual({ ok: true, outcome: 'duplicate' });
    expect(await me<PremiumDto>('/v1/me/premium')).toMatchObject({ premium: true, productId: 'appinity_premium_monthly' });
    // Premium explora más personas; el chat lo refleja.
    expect((await me<SoulmatesDto>('/v1/me/soulmates')).limit).toBe(200);
    expect(await me<ChatConfigDto>('/v1/me/chats/config')).toMatchObject({ premium: true, premiumSource: 'revenuecat' });
  });

  it('una compra de producción no cuenta en una instalación de sandbox', async () => {
    const other = DEMO_USERS[1]!;
    await hook({ event: { id: 'evt-http-2', type: 'INITIAL_PURCHASE', app_user_id: other.id, entitlement_ids: ['premium'], environment: 'PRODUCTION', event_timestamp_ms: Date.now() } });
    const res = await fetch(`${base}/v1/dev/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: other.handle }) });
    const otherToken = ((await res.json()) as { token: string }).token;
    const status = (await (await fetch(`${base}/v1/me/premium`, { headers: { Authorization: `Bearer ${otherToken}` } })).json()) as PremiumDto;
    expect(status.premium).toBe(false);
  });
});

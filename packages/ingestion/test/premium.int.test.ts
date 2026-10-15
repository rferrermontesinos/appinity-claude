import { createDatabase, revenuecatEvents, type DatabaseHandle } from '@appinity/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ForbiddenError,
  applyRevenueCatEvent,
  createOrResetLocalUser,
  premiumStatus,
  respondFriendRequest,
  sendChatInterest,
  sendFriendRequest,
  type ChatPolicy,
  type RevenueCatEvent,
} from '../src/index.js';

/** Personas SINTÉTICAS (dataset live, «test_premium_*»). Eventos de RevenueCat construidos según su documentación. */
let database: DatabaseHandle;
const id: Record<string, string> = {};
const ENT = { entitlementId: 'premium' };
const NOW = new Date('2026-10-15T12:00:00Z');
const DAY = 24 * 3600_000;
let counter = 0;
const event = (patch: Partial<RevenueCatEvent>): RevenueCatEvent => ({
  id: `evt-${++counter}`,
  type: 'INITIAL_PURCHASE',
  app_user_id: id.ana,
  entitlement_ids: ['premium'],
  product_id: 'appinity_premium_monthly',
  expiration_at_ms: NOW.getTime() + 30 * DAY,
  event_timestamp_ms: NOW.getTime() - 60_000,
  environment: 'SANDBOX',
  ...patch,
});
const sandbox = (userId: string, now = NOW) => premiumStatus(database.db, userId, { ...ENT, environment: 'sandbox', now });

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  for (const name of ['ana', 'bea', 'carla', 'dani']) {
    id[name] = (await createOrResetLocalUser(database.db, { handle: `test_premium_${name}`, displayName: `Sintética ${name}` })).userId;
  }
});

afterAll(async () => {
  await database?.close();
});

describe('webhooks de RevenueCat', () => {
  it('compra → Premium hasta la caducidad; el mismo evento repetido no se procesa dos veces', async () => {
    const purchase = event({});
    expect(await applyRevenueCatEvent(database.db, purchase, { ...ENT, now: NOW })).toBe('applied');
    expect(await sandbox(id.ana!)).toMatchObject({ premium: true, productId: 'appinity_premium_monthly', expiresAt: new Date(NOW.getTime() + 30 * DAY).toISOString() });
    expect(await applyRevenueCatEvent(database.db, purchase, { ...ENT, now: NOW })).toBe('duplicate');
    expect(await database.db.select().from(revenuecatEvents).where(eq(revenuecatEvents.eventId, purchase.id))).toHaveLength(1);
    // Pasada la caducidad sin renovación, deja de ser Premium aunque no haya llegado EXPIRATION.
    expect(await sandbox(id.ana!, new Date(NOW.getTime() + 31 * DAY))).toMatchObject({ premium: false });
  });

  it('cancelar no retira el acceso hasta caducar; EXPIRATION sí', async () => {
    await applyRevenueCatEvent(database.db, event({ app_user_id: id.bea, type: 'INITIAL_PURCHASE', event_timestamp_ms: NOW.getTime() - 3000 }), { ...ENT, now: NOW });
    await applyRevenueCatEvent(database.db, event({ app_user_id: id.bea, type: 'CANCELLATION', event_timestamp_ms: NOW.getTime() - 2000 }), { ...ENT, now: NOW });
    expect(await sandbox(id.bea!)).toMatchObject({ premium: true });
    await applyRevenueCatEvent(database.db, event({ app_user_id: id.bea, type: 'EXPIRATION', expiration_at_ms: NOW.getTime() - 1000, event_timestamp_ms: NOW.getTime() - 1000 }), { ...ENT, now: NOW });
    expect(await sandbox(id.bea!)).toMatchObject({ premium: false, productId: null, expiresAt: null });
  });

  it('un evento antiguo que llega tarde no deshace el estado más reciente', async () => {
    const late = event({ app_user_id: id.bea, type: 'RENEWAL', event_timestamp_ms: NOW.getTime() - 10_000 });
    expect(await applyRevenueCatEvent(database.db, late, { ...ENT, now: NOW })).toBe('ignored_stale');
    expect(await sandbox(id.bea!)).toMatchObject({ premium: false });
  });

  it('sandbox y producción se guardan por separado', async () => {
    await applyRevenueCatEvent(database.db, event({ app_user_id: id.carla, environment: 'PRODUCTION' }), { ...ENT, now: NOW });
    expect(await sandbox(id.carla!)).toMatchObject({ premium: false });
    expect(await premiumStatus(database.db, id.carla!, { ...ENT, environment: 'production', now: NOW })).toMatchObject({ premium: true });
  });

  it('transferencia: el destino gana el acceso y el origen lo pierde', async () => {
    await applyRevenueCatEvent(
      database.db,
      event({ type: 'TRANSFER', app_user_id: id.dani, transferred_from: [id.ana!], transferred_to: [id.dani!], entitlement_ids: null, event_timestamp_ms: NOW.getTime() }),
      { ...ENT, now: NOW },
    );
    expect(await sandbox(id.ana!)).toMatchObject({ premium: false });
    expect(await sandbox(id.dani!)).toMatchObject({ premium: true });
  });

  it('otro entitlement, usuario desconocido y evento TEST: se registran sin conceder nada', async () => {
    expect(await applyRevenueCatEvent(database.db, event({ app_user_id: id.carla, entitlement_ids: ['otro'] }), { ...ENT, now: NOW })).toBe('ignored_entitlement');
    expect(await applyRevenueCatEvent(database.db, event({ app_user_id: '00000000-0000-4000-a000-0000000000ff' }), { ...ENT, now: NOW })).toBe('unknown_user');
    expect(await applyRevenueCatEvent(database.db, event({ type: 'TEST', app_user_id: 'usuario-de-prueba' }), { ...ENT, now: NOW })).toBe('test');
  });
});

describe('hablar con almas gemelas como función Premium (flag)', () => {
  const policy = (premium: string[]): ChatPolicy => ({
    earlyAccess: true,
    premiumDirectMessage: false,
    soulmateChatRequiresPremium: true,
    isPremium: (u) => premium.includes(u),
  });

  it('sin Premium: solo se puede pedir chat a amigos; con Premium, a cualquiera que se pueda ver', async () => {
    await expect(sendChatInterest(database.db, policy([]), id.bea!, id.carla!)).rejects.toBeInstanceOf(ForbiddenError);
    await sendFriendRequest(database.db, id.bea!, id.carla!);
    const { rows } = await database.pool.query<{ id: string }>("select id from friendships where status = 'pending' limit 1");
    await respondFriendRequest(database.db, id.carla!, rows[0]!.id, true);
    // Amigas: la amistad ya abrió el chat; pedirlo no exige Premium.
    expect(await sendChatInterest(database.db, policy([]), id.bea!, id.carla!)).toMatchObject({ state: 'matched' });
    expect(await sendChatInterest(database.db, policy([id.bea!]), id.bea!, id.dani!)).toMatchObject({ state: 'request_sent' });
  });
});

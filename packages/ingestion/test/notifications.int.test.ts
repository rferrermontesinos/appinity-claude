import { createDatabase, notificationDeliveries, pushTokens, userSettings, type DatabaseHandle } from '@appinity/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ConflictError,
  DEMO_USERS,
  isDigestDue,
  localParts,
  recomputeAffinities,
  registerPushToken,
  seedDemo,
  sendDueDigests,
  type PushMessage,
  type PushSender,
  type PushTicket,
} from '../src/index.js';

let database: DatabaseHandle;
const laura = DEMO_USERS[0]!;
const alex = DEMO_USERS[1]!;
const TOKEN_LAURA = 'ExponentPushToken[laura-simulado-0001]';
const TOKEN_ALEX = 'ExponentPushToken[alex-simulado-00002]';
// Lunes 19 de octubre de 2026, 19:30 en Madrid (UTC+2).
const MONDAY_EVENING = new Date('2026-10-19T17:30:00Z');

/** Emisor SIMULADO: no envía nada; registra los mensajes y devuelve los tickets que se le indiquen. */
function fakeSender(ticketFor: (m: PushMessage) => PushTicket = () => ({ status: 'ok', id: `ticket-${Math.random()}` })) {
  const sent: PushMessage[] = [];
  const sender: PushSender = { send: async (messages) => (sent.push(...messages), messages.map(ticketFor)) };
  return { sender, sent };
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  await seedDemo(database);
  await recomputeAffinities(database.db);
});

afterAll(async () => {
  await database?.close();
});

describe('calendario de resúmenes', () => {
  it('fecha, día y hora en la zona horaria de la persona', () => {
    expect(localParts(MONDAY_EVENING, 'Europe/Madrid')).toEqual({ date: '2026-10-19', weekday: 1, hour: 19 });
    expect(localParts(MONDAY_EVENING, 'America/New_York')).toEqual({ date: '2026-10-19', weekday: 1, hour: 13 });
    expect(localParts(new Date('2026-10-19T23:30:00Z'), 'Asia/Tokyo')).toEqual({ date: '2026-10-20', weekday: 2, hour: 8 });
  });

  it('frecuencias: tres por semana (L, X, V), diaria, semanal (domingo) y desactivada; ventana de 19 a 22 h', () => {
    expect(isDigestDue('three_per_week', { weekday: 1, hour: 19 })).toBe(true);
    expect(isDigestDue('three_per_week', { weekday: 2, hour: 19 })).toBe(false);
    expect(isDigestDue('three_per_week', { weekday: 5, hour: 21 })).toBe(true);
    expect(isDigestDue('three_per_week', { weekday: 5, hour: 22 })).toBe(false);
    expect(isDigestDue('daily', { weekday: 2, hour: 20 })).toBe(true);
    expect(isDigestDue('weekly', { weekday: 0, hour: 19 })).toBe(true);
    expect(isDigestDue('weekly', { weekday: 1, hour: 19 })).toBe(false);
    expect(isDigestDue('off', { weekday: 1, hour: 19 })).toBe(false);
  });
});

describe('tokens', () => {
  it('valida el formato y un mismo dispositivo que cambia de cuenta pasa a la nueva', async () => {
    await expect(registerPushToken(database.db, laura.id, 'no-es-un-token', 'android')).rejects.toBeInstanceOf(ConflictError);
    await registerPushToken(database.db, alex.id, TOKEN_LAURA, 'android');
    await registerPushToken(database.db, laura.id, TOKEN_LAURA, 'android');
    const rows = await database.db.select().from(pushTokens).where(eq(pushTokens.token, TOKEN_LAURA));
    expect(rows.map((r) => r.userId)).toEqual([laura.id]);
  });
});

describe('envío de resúmenes', () => {
  it('a su hora local: un resumen con recomendaciones no vistas; nunca dos el mismo día', async () => {
    const { sender, sent } = fakeSender();
    const first = await sendDueDigests(database.db, sender, { now: MONDAY_EVENING });
    expect(first).toMatchObject({ sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: TOKEN_LAURA, title: 'Novedades de tus almas gemelas', data: { screen: 'home' } });
    expect(sent[0]!.body).toMatch(/recomendaci/);
    const [delivery] = await database.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.userId, laura.id));
    expect(delivery).toMatchObject({ status: 'sent', localDate: '2026-10-19' });
    expect(delivery!.recommendations).toBeGreaterThan(0);
    // Media hora después, mismo día: nada.
    expect(await sendDueDigests(database.db, sender, { now: new Date(MONDAY_EVENING.getTime() + 30 * 60_000) })).toMatchObject({ sent: 0 });
    expect(sent).toHaveLength(1);
    // Martes: no toca con «tres por semana».
    expect(await sendDueDigests(database.db, sender, { now: new Date(MONDAY_EVENING.getTime() + 24 * 3600_000) })).toMatchObject({ considered: 0 });
  });

  it('desactivadas: no se envía; otra zona horaria: a su propia hora', async () => {
    await registerPushToken(database.db, alex.id, TOKEN_ALEX, 'android');
    await database.db.update(userSettings).set({ notificationFrequency: 'off' }).where(eq(userSettings.userId, alex.id));
    const { sender, sent } = fakeSender();
    await sendDueDigests(database.db, sender, { now: new Date('2026-10-21T17:30:00Z') });
    expect(sent.map((m) => m.to)).not.toContain(TOKEN_ALEX);
    await database.db.update(userSettings).set({ notificationFrequency: 'daily', timeZone: 'America/New_York' }).where(eq(userSettings.userId, alex.id));
    // 19:30 en Madrid es 13:30 en Nueva York: aún no.
    await sendDueDigests(database.db, sender, { now: new Date('2026-10-22T17:30:00Z') });
    expect(sent.map((m) => m.to)).not.toContain(TOKEN_ALEX);
    // 19:30 en Nueva York (UTC−4).
    await sendDueDigests(database.db, sender, { now: new Date('2026-10-22T23:30:00Z') });
    expect(sent.map((m) => m.to)).toContain(TOKEN_ALEX);
  });

  it('DeviceNotRegistered desactiva el token y el envío queda como fallido', async () => {
    const { sender } = fakeSender(() => ({ status: 'error', message: 'not registered', error: 'DeviceNotRegistered' }));
    await database.db.update(userSettings).set({ notificationFrequency: 'daily' }).where(eq(userSettings.userId, laura.id));
    expect(await sendDueDigests(database.db, sender, { now: new Date('2026-10-20T17:30:00Z') })).toMatchObject({ failed: 1 });
    const [token] = await database.db.select().from(pushTokens).where(eq(pushTokens.token, TOKEN_LAURA));
    expect(token!.disabledAt).not.toBeNull();
    const [delivery] = await database.db
      .select()
      .from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.userId, laura.id), eq(notificationDeliveries.localDate, '2026-10-20')));
    expect(delivery).toMatchObject({ status: 'failed' });
  });
});

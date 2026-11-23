import {
  authSessions,
  catalogItems,
  createDatabase,
  pushTokens,
  sourceCredentials,
  userAffinities,
  userConnections,
  users,
  type DatabaseHandle,
} from '@appinity/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ACCOUNT_EXPORT_FORMAT,
  blockUser,
  castVote,
  completeOnboarding,
  createOrResetLocalUser,
  createSession,
  exportAccountData,
  findAccounts,
  findOrCreateUserForIdentity,
  listFriends,
  openChat,
  respondFriendRequest,
  sendFriendRequest,
  sendMessage,
  type ChatPolicy,
} from '../src/index.js';

/**
 * Copia de los datos de una persona (derechos de acceso y portabilidad, fase B3). Personas SINTÉTICAS (dataset live):
 * Ana entra con Google; Bea y Carla son cuentas locales («test_export_*»).
 */
let database: DatabaseHandle;
let ana = '';
let bea = '';
let carla = '';
let refreshToken = '';
const POLICY: ChatPolicy = { earlyAccess: true, premiumDirectMessage: false, isPremium: () => false };

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  const db = database.db;
  await truncateAll(db);
  ana = (await findOrCreateUserForIdentity(db, { provider: 'google', subject: 'export-ana', email: 'Ana.Export@example.com', name: 'Ana' })).userId;
  await completeOnboarding(db, ana, { adult: true, termsAccepted: true });
  bea = (await createOrResetLocalUser(db, { handle: 'test_export_bea', displayName: 'Sintética Bea' })).userId;
  carla = (await createOrResetLocalUser(db, { handle: 'test_export_carla', displayName: 'Sintética Carla' })).userId;

  const [film] = await db
    .insert(catalogItems)
    .values({ dataset: 'live', category: 'movies', itemType: 'movie', title: 'Película de prueba', normalizedTitle: 'pelicula de prueba', createdVia: 'test' })
    .returning({ id: catalogItems.id });
  await castVote(db, ana, film!.id, 2);

  await sendFriendRequest(db, ana, bea);
  const [request] = (await listFriends(db, bea)).incoming;
  await respondFriendRequest(db, bea, request!.requestId, true);
  const { conversationId } = await openChat(db, POLICY, ana, bea);
  await sendMessage(db, ana, conversationId, 'Hola, soy Ana');
  await sendMessage(db, bea, conversationId, 'Mensaje privado de Bea');
  await blockUser(db, ana, carla);

  // Secretos que nunca deben salir en la copia.
  refreshToken = (await createSession(db, ana)).refreshToken;
  await db.insert(pushTokens).values({ userId: ana, token: 'ExponentPushToken[secreto-del-dispositivo]', platform: 'android' });
  const [steam] = await db
    .insert(userConnections)
    .values({ userId: ana, sourceKey: 'steam', status: 'active', externalAccountRef: '76561190000000000' })
    .returning();
  await db.insert(sourceCredentials).values({ connectionId: steam!.id, ciphertext: 'credencial-cifrada-secreta' });
  // Afinidad calculada con alguien que no la ve: no es de Ana.
  await db
    .insert(userAffinities)
    .values({ sourceUserId: ana, targetUserId: carla, score: 91, confidence: 0.9, categoriesCompared: 3, commonItems: 12, algorithmVersion: 'test' });
});

afterAll(async () => {
  await database?.close();
});

describe('peticiones de derechos: encontrar la cuenta', () => {
  it('por el email de Google sin distinguir mayúsculas, o por handle', async () => {
    const byEmail = await findAccounts(database.db, { email: ' ana.export@EXAMPLE.com ' });
    expect(byEmail).toEqual([expect.objectContaining({ userId: ana, dataset: 'live', emails: ['Ana.Export@example.com'] })]);
    expect(await findAccounts(database.db, { handle: 'test_export_bea' })).toEqual([expect.objectContaining({ userId: bea, emails: [] })]);
    expect(await findAccounts(database.db, { email: 'nadie@example.com' })).toEqual([]);
    expect(await findAccounts(database.db, {})).toEqual([]);
  });
});

describe('copia de los datos (pnpm account:export)', () => {
  it('reúne cuenta, gustos, votos, amistades y chat con nombres legibles', async () => {
    const data = await exportAccountData(database.db, ana, new Date('2026-11-22T10:00:00Z'));
    expect(data.format).toBe(ACCOUNT_EXPORT_FORMAT);
    expect(data.generatedAt).toBe('2026-11-22T10:00:00.000Z');
    expect(data.account).toMatchObject({ id: ana, status: 'active' });
    expect(data.identities).toEqual([expect.objectContaining({ provider: 'google', email: 'Ana.Export@example.com' })]);
    expect(data.profile).toMatchObject({ displayName: 'Ana' });
    expect(data.settings).toMatchObject({ shareCommonTastes: false, discoverableByContacts: false });
    expect(data.votes).toEqual([expect.objectContaining({ vote: 'Me encanta', item: expect.objectContaining({ title: 'Película de prueba' }) })]);
    // El voto es una evidencia de la fuente APPINITY y entra en sus gustos.
    expect(data.evidence).toEqual([expect.objectContaining({ source: 'appinity', kind: 'vote', preference: 1 })]);
    expect(data.tastes).toEqual([expect.objectContaining({ preference: 1, item: expect.objectContaining({ category: 'movies' }) })]);
    expect(data.connections.map((c) => c.source).sort()).toEqual(['appinity', 'steam']);
    expect(data.social.friendships).toEqual([
      expect.objectContaining({ with: { handle: 'test_export_bea', displayName: 'Sintética Bea' }, requestedByYou: true, status: 'accepted' }),
    ]);
    // Al aceptar la amistad os seguís: Ana ve a quién sigue, pero de quien la sigue solo cuántas personas.
    expect(data.social.following).toEqual([expect.objectContaining({ person: expect.objectContaining({ handle: 'test_export_bea' }) })]);
    expect(data.social.followers).toBe(1);
    expect(data.social.blocked).toEqual([expect.objectContaining({ person: expect.objectContaining({ handle: 'test_export_carla' }) })]);
    expect(data.sessions).toHaveLength(1);
    expect(data.notifications.devices).toEqual([expect.objectContaining({ platform: 'android' })]);
  });

  it('del chat solo incluye lo que escribió la persona; de lo recibido, cuántos mensajes', async () => {
    const data = await exportAccountData(database.db, ana);
    expect(data.chat.conversations).toEqual([
      expect.objectContaining({
        with: expect.objectContaining({ handle: 'test_export_bea' }),
        messagesSent: [expect.objectContaining({ body: 'Hola, soy Ana' })],
        messagesReceived: 1,
      }),
    ]);
    expect(JSON.stringify(data)).not.toContain('Mensaje privado de Bea');
  });

  it('nunca incluye secretos ni afinidades con otras personas', async () => {
    const data = await exportAccountData(database.db, ana);
    const text = JSON.stringify(data);
    const [session] = await database.db.select().from(authSessions).where(eq(authSessions.userId, ana));
    for (const secret of [refreshToken, session!.refreshTokenHash, 'ExponentPushToken', 'credencial-cifrada-secreta']) expect(text).not.toContain(secret);
    expect(Object.keys(data)).not.toContain('affinities');
    expect(text).not.toMatch(/"score":91/);
    expect(data.excluded.join(' ')).toMatch(/Afinidades calculadas/);
  });

  it('una cuenta que no existe es un error', async () => {
    const [ghost] = await database.db.select({ id: users.id }).from(users).where(eq(users.handle, 'test_export_carla'));
    await database.db.delete(users).where(eq(users.id, ghost!.id));
    await expect(exportAccountData(database.db, ghost!.id)).rejects.toThrow(/no encontrada/);
    // El bloqueo desaparece con la cuenta bloqueada (cascada) y la copia de Ana sigue saliendo.
    expect((await exportAccountData(database.db, ana)).social.blocked).toEqual([]);
  });
});

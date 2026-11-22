import { conversations, createDatabase, messageRequests, userAffinities, userItemProfiles, type DatabaseHandle } from '@appinity/database';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  CHAT_LIMITS,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  blockUser,
  chatInbox,
  chatState,
  conversationMessages,
  createOrResetLocalUser,
  markConversationRead,
  respondChatRequest,
  respondFriendRequest,
  seedDemoUsers,
  sendChatInterest,
  sendDirectMessage,
  sendFriendRequest,
  sendMessage,
  unblockUser,
  unmatch,
  type ChatPolicy,
} from '../src/index.js';

/** Personas SINTÉTICAS (dataset live, «test_chat_*»). */
let database: DatabaseHandle;
const id: Record<string, string> = {};
const DEMO_LAURA = '00000000-0000-4000-a000-000000000001';
const FREE: ChatPolicy = { earlyAccess: true, premiumDirectMessage: true, isPremium: () => false };
/** Solo en tests: un entitlement inyectado para probar la ruta Premium. La API no tiene ninguno (sin RevenueCat). */
const PREMIUM_FOR_TEST: ChatPolicy = { earlyAccess: true, premiumDirectMessage: true, isPremium: (u) => u === id.eva };

async function convId(a: string, b: string): Promise<string> {
  const state = await chatState(database.db, a, b);
  if (state.state !== 'matched') throw new Error(`sin match: ${state.state}`);
  return state.conversationId;
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  for (const name of ['ana', 'bea', 'carla', 'dani', 'eva', 'fran', 'gala']) {
    id[name] = (await createOrResetLocalUser(database.db, { handle: `test_chat_${name}`, displayName: `Sintética ${name}` })).userId;
  }
});

afterAll(async () => {
  await database?.close();
});

describe('solicitud y match (EARLY_ACCESS)', () => {
  it('interés → solicitud recibida → aceptar: match y conversación', async () => {
    expect(await sendChatInterest(database.db, FREE, id.ana!, id.bea!)).toEqual({ state: 'request_sent', conversationId: null, newMatch: false });
    // Reenviar no duplica.
    await sendChatInterest(database.db, FREE, id.ana!, id.bea!);
    expect(await chatState(database.db, id.ana!, id.bea!)).toEqual({ state: 'request_sent', kind: 'interest' });
    const inbox = await chatInbox(database.db, id.bea!);
    expect(inbox.requests).toEqual([expect.objectContaining({ kind: 'interest', firstMessage: null, person: expect.objectContaining({ userId: id.ana }) })]);
    expect(inbox.badge).toBe(1);
    // Solo quien la recibe puede responderla.
    await expect(respondChatRequest(database.db, id.ana!, inbox.requests[0]!.requestId, 'accept')).rejects.toBeInstanceOf(NotFoundError);
    const result = await respondChatRequest(database.db, id.bea!, inbox.requests[0]!.requestId, 'accept');
    expect(result).toMatchObject({ state: 'matched', newMatch: true });
    expect(await chatState(database.db, id.ana!, id.bea!)).toEqual({ state: 'matched', conversationId: result.conversationId });
    // Para Ana es un match nuevo (no lo ha visto); Bea lo provocó y ya lo vio.
    expect((await chatInbox(database.db, id.ana!)).matches).toEqual([expect.objectContaining({ conversationId: result.conversationId, isNew: true })]);
    expect((await chatInbox(database.db, id.bea!)).matches).toEqual([expect.objectContaining({ isNew: false })]);
    expect((await chatInbox(database.db, id.bea!)).badge).toBe(0);
  });

  it('interés mutuo: match inmediato', async () => {
    await sendChatInterest(database.db, FREE, id.carla!, id.dani!);
    expect(await sendChatInterest(database.db, FREE, id.dani!, id.carla!)).toMatchObject({ state: 'matched', newMatch: true });
    // Repetir con match activo no crea nada nuevo.
    expect(await sendChatInterest(database.db, FREE, id.carla!, id.dani!)).toMatchObject({ state: 'matched', newMatch: false });
  });

  it('ignorar no se revela ni permite insistir; quien ignoró puede cambiar de idea', async () => {
    await sendChatInterest(database.db, FREE, id.ana!, id.carla!);
    const [request] = (await chatInbox(database.db, id.carla!)).requests;
    await respondChatRequest(database.db, id.carla!, request!.requestId, 'ignore');
    expect(await chatState(database.db, id.ana!, id.carla!)).toEqual({ state: 'request_sent', kind: 'interest' });
    expect(await sendChatInterest(database.db, FREE, id.ana!, id.carla!)).toMatchObject({ state: 'request_sent' });
    expect((await chatInbox(database.db, id.carla!)).requests).toEqual([]);
    expect(await chatState(database.db, id.carla!, id.ana!)).toEqual({ state: 'none' });
    expect(await sendChatInterest(database.db, FREE, id.carla!, id.ana!)).toMatchObject({ state: 'matched', newMatch: true });
  });

  it('otro dataset o una misma: no encontrada', async () => {
    await expect(sendChatInterest(database.db, FREE, id.ana!, DEMO_LAURA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendChatInterest(database.db, FREE, id.ana!, id.ana!)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('una amistad aceptada abre el chat', async () => {
    await sendFriendRequest(database.db, id.eva!, id.fran!);
    expect(await sendFriendRequest(database.db, id.fran!, id.eva!)).toEqual({ state: 'friends' });
    expect(await chatState(database.db, id.eva!, id.fran!)).toMatchObject({ state: 'matched' });
    await sendFriendRequest(database.db, id.gala!, id.eva!);
    const friendRequest = (await database.db.query.friendships.findMany()).find((f) => f.requesterId === id.gala)!;
    await respondFriendRequest(database.db, id.eva!, friendRequest.id, true);
    const [row] = await database.db.select().from(conversations).where(eq(conversations.id, await convId(id.gala!, id.eva!)));
    expect(row!.origin).toBe('friendship');
  });

  it('sin EARLY_ACCESS no se puede pedir chat', async () => {
    await expect(sendChatInterest(database.db, { ...FREE, earlyAccess: false }, id.bea!, id.dani!)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('mensajes', () => {
  it('solo los miembros leen y escriben; leído y no leído', async () => {
    const conv = await convId(id.ana!, id.bea!);
    const sent = await sendMessage(database.db, id.ana!, conv, '  ¡Hola! ¿Qué estás escuchando?  ');
    expect(sent).toMatchObject({ mine: true, body: '¡Hola! ¿Qué estás escuchando?' });
    await expect(sendMessage(database.db, id.carla!, conv, 'intrusa')).rejects.toBeInstanceOf(NotFoundError);
    await expect(conversationMessages(database.db, id.carla!, conv)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendMessage(database.db, id.ana!, conv, '   ')).rejects.toBeInstanceOf(ConflictError);
    await expect(sendMessage(database.db, id.ana!, conv, 'x'.repeat(CHAT_LIMITS.bodyMaxLength + 1))).rejects.toBeInstanceOf(ConflictError);

    let bea = await chatInbox(database.db, id.bea!);
    expect(bea.matches).toEqual([]);
    expect(bea.conversations).toEqual([expect.objectContaining({ conversationId: conv, unread: 1, lastMessage: expect.objectContaining({ mine: false }) })]);
    expect(bea.badge).toBe(1);
    const page = await conversationMessages(database.db, id.bea!, conv);
    expect(page.messages.map((m) => [m.body, m.mine])).toEqual([['¡Hola! ¿Qué estás escuchando?', false]]);
    expect(page.conversation.person.userId).toBe(id.ana);
    await markConversationRead(database.db, id.bea!, conv);
    bea = await chatInbox(database.db, id.bea!);
    expect(bea.conversations[0]!.unread).toBe(0);
    expect(bea.badge).toBe(0);
    expect((await conversationMessages(database.db, id.ana!, conv)).conversation.otherLastReadAt).not.toBeNull();
  });

  it('reintento con el mismo clientId no duplica; paginación hacia atrás', async () => {
    const conv = await convId(id.carla!, id.dani!);
    const base = Date.parse('2026-10-01T10:00:00Z');
    for (let i = 0; i < 5; i++) await sendMessage(database.db, id.carla!, conv, `m${i}`, `c-${i}`, new Date(base + i * 1000));
    const again = await sendMessage(database.db, id.carla!, conv, 'm0', 'c-0', new Date(base + 9000));
    expect(again.body).toBe('m0');
    const last = await conversationMessages(database.db, id.dani!, conv, { limit: 2 });
    expect(last.messages.map((m) => m.body)).toEqual(['m3', 'm4']);
    expect(last.hasMore).toBe(true);
    const older = await conversationMessages(database.db, id.dani!, conv, { limit: 10, before: new Date(last.messages[0]!.createdAt) });
    expect(older.messages.map((m) => m.body)).toEqual(['m0', 'm1', 'm2']);
    expect(older.hasMore).toBe(false);
  });

  it('límite de mensajes por minuto', async () => {
    const conv = await convId(id.eva!, id.fran!);
    const now = new Date('2026-10-02T12:00:00Z');
    for (let i = 0; i < CHAT_LIMITS.messagesPerMinute; i++) await sendMessage(database.db, id.eva!, conv, `r${i}`, undefined, new Date(now.getTime() + i));
    await expect(sendMessage(database.db, id.eva!, conv, 'una más', undefined, new Date(now.getTime() + 100))).rejects.toBeInstanceOf(RateLimitedError);
    // Pasado el minuto, vuelve a poder.
    await sendMessage(database.db, id.eva!, conv, 'ya', undefined, new Date(now.getTime() + 61_000));
  });
});

describe('bloquear y deshacer el match', () => {
  it('bloquear detiene los mensajes y oculta la conversación; desbloquear no la recupera', async () => {
    const conv = await convId(id.carla!, id.ana!);
    await sendMessage(database.db, id.ana!, conv, 'antes del bloqueo');
    await blockUser(database.db, id.carla!, id.ana!);
    await expect(sendMessage(database.db, id.ana!, conv, '¿hola?')).rejects.toBeInstanceOf(NotFoundError);
    await expect(conversationMessages(database.db, id.ana!, conv)).rejects.toBeInstanceOf(NotFoundError);
    expect((await chatInbox(database.db, id.ana!)).conversations.map((c) => c.conversationId)).not.toContain(conv);
    await unblockUser(database.db, id.carla!, id.ana!);
    expect(await chatState(database.db, id.ana!, id.carla!)).toEqual({ state: 'none' });
    // Un match nuevo reabre la conversación vacía.
    await sendChatInterest(database.db, FREE, id.ana!, id.carla!);
    expect(await sendChatInterest(database.db, FREE, id.carla!, id.ana!)).toMatchObject({ state: 'matched', conversationId: conv, newMatch: true });
    expect((await conversationMessages(database.db, id.carla!, conv)).messages).toEqual([]);
  });

  it('deshacer el match: desaparece para ambas y la otra persona no puede insistir', async () => {
    const conv = await convId(id.ana!, id.bea!);
    await expect(unmatch(database.db, id.carla!, conv)).rejects.toBeInstanceOf(NotFoundError);
    await unmatch(database.db, id.bea!, conv);
    await expect(conversationMessages(database.db, id.ana!, conv)).rejects.toBeInstanceOf(NotFoundError);
    expect(await chatState(database.db, id.ana!, id.bea!)).toEqual({ state: 'request_sent', kind: 'interest' });
    expect(await sendChatInterest(database.db, FREE, id.ana!, id.bea!)).toMatchObject({ state: 'request_sent' });
    expect((await chatInbox(database.db, id.bea!)).requests).toEqual([]);
    expect(await chatState(database.db, id.bea!, id.ana!)).toEqual({ state: 'none' });
  });
});

describe('primer mensaje directo (PREMIUM_DIRECT_MESSAGE)', () => {
  it('sin entitlement: prohibido; con flag desactivado, también', async () => {
    await expect(sendDirectMessage(database.db, FREE, id.gala!, id.dani!, 'hola')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendDirectMessage(database.db, { ...PREMIUM_FOR_TEST, premiumDirectMessage: false }, id.eva!, id.dani!, 'hola')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('Premium escribe; un solo mensaje sin respuesta; aceptar abre la conversación con ese mensaje', async () => {
    expect(await sendDirectMessage(database.db, PREMIUM_FOR_TEST, id.eva!, id.dani!, 'Vi que te gusta Rosalía')).toMatchObject({ state: 'request_sent' });
    await expect(sendDirectMessage(database.db, PREMIUM_FOR_TEST, id.eva!, id.dani!, '¿hola?')).rejects.toBeInstanceOf(ConflictError);
    const [request] = (await chatInbox(database.db, id.dani!)).requests;
    expect(request).toMatchObject({ kind: 'direct', firstMessage: 'Vi que te gusta Rosalía' });
    const result = await respondChatRequest(database.db, id.dani!, request!.requestId, 'accept');
    const page = await conversationMessages(database.db, id.dani!, result.conversationId!);
    expect(page.messages).toEqual([expect.objectContaining({ body: 'Vi que te gusta Rosalía', mine: false })]);
    expect(page.conversation.origin).toBe('direct');
  });
});

describe('anti-abuso y gustos', () => {
  it('límite diario de solicitudes', async () => {
    const sender = id.gala!;
    const already = (await database.db.select({ n: count() }).from(messageRequests).where(eq(messageRequests.senderId, sender)))[0]!.n;
    const targets: string[] = [];
    for (let i = 0; i < CHAT_LIMITS.requestsPerDay - already + 1; i++) {
      targets.push((await createOrResetLocalUser(database.db, { handle: `test_chat_bulk_${i}`, displayName: `Sintética ${i}` })).userId);
    }
    const now = new Date();
    for (const target of targets.slice(0, -1)) await sendChatInterest(database.db, FREE, sender, target, now);
    await expect(sendChatInterest(database.db, FREE, sender, targets.at(-1)!, now)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('ningún paso del chat crea ni modifica gustos ni afinidades', async () => {
    const before = await Promise.all([
      database.db.select({ n: count() }).from(userItemProfiles),
      database.db.select({ n: count() }).from(userAffinities),
    ]);
    await sendChatInterest(database.db, FREE, id.fran!, id.gala!);
    const [request] = (await chatInbox(database.db, id.gala!)).requests;
    const { conversationId } = await respondChatRequest(database.db, id.gala!, request!.requestId, 'accept');
    await sendMessage(database.db, id.gala!, conversationId!, 'hola');
    await markConversationRead(database.db, id.fran!, conversationId!);
    await unmatch(database.db, id.fran!, conversationId!);
    const after = await Promise.all([
      database.db.select({ n: count() }).from(userItemProfiles),
      database.db.select({ n: count() }).from(userAffinities),
    ]);
    expect(after).toEqual(before);
  });
});

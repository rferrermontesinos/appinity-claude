import type { INestApplication } from '@nestjs/common';
import { createDatabase, userAffinities, userBlocks, users, type DatabaseHandle } from '@appinity/database';
import { DEMO_USERS, recomputeAffinities, seedDemo } from '@appinity/ingestion';
import { CATEGORIES, type AffinityDto, type ChatConfigDto, type ChatConversationDto, type ChatInboxDto, type ChatMatchResultDto, type FriendsDto, type PublicPersonDto, type RecommendationsDto, type SoulmatesDto } from '@appinity/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

const LIVE_USER_ID = '10000000-0000-4000-a000-0000000000af';

let db: DatabaseHandle;
let app: INestApplication;
let base: string;
let token: string;
const laura = DEMO_USERS[0]!;

async function get(path: string) {
  return fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

beforeAll(async () => {
  const env = testEnv();
  db = createDatabase(env.DATABASE_URL!);
  await truncateAll(db.db);
  await seedDemo(db);
  await recomputeAffinities(db.db);
  await db.db.insert(users).values({ id: LIVE_USER_ID, handle: 'real_afinidad', dataset: 'live' }).onConflictDoNothing();
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const res = await fetch(`${base}/v1/dev/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: laura.handle }) });
  token = ((await res.json()) as { token: string }).token;
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('GET /v1/me/affinities/:userId', () => {
  it('devuelve la afinidad propia hacia cada persona de la demo, con las ocho categorías y NULL donde no hay datos', async () => {
    for (const other of DEMO_USERS.filter((u) => u.id !== laura.id)) {
      const res = await get(`/v1/me/affinities/${other.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as AffinityDto;
      expect(body.categories.map((c) => c.category)).toEqual([...CATEGORIES]);
      const [stored] = await db.db
        .select()
        .from(userAffinities)
        .where(and(eq(userAffinities.sourceUserId, laura.id), eq(userAffinities.targetUserId, other.id)));
      // La API refleja lo calculado: sin fila, NULL (nunca 0 inventado).
      expect(body.score).toBe(stored?.score ?? null);
      expect(body.categoriesCompared).toBe(stored?.categoriesCompared ?? 0);
      expect(body.categories.filter((c) => c.score !== null)).toHaveLength(stored?.categoriesCompared ?? 0);
      // Nunca revela qué objetos coinciden ni la afinidad inversa.
      expect(JSON.stringify(body)).not.toMatch(/itemId|catalogItemId|reverse/);
    }
  });

  it('no se puede consultar a uno mismo, a una cuenta real desde la demo ni a alguien inexistente', async () => {
    expect((await get(`/v1/me/affinities/${laura.id}`)).status).toBe(404);
    expect((await get(`/v1/me/affinities/${LIVE_USER_ID}`)).status).toBe(404);
    expect((await get('/v1/me/affinities/10000000-0000-4000-a000-00000000ffff')).status).toBe(404);
    expect((await get('/v1/me/affinities/no-es-un-uuid')).status).toBe(400);
  });

  it('exige sesión', async () => {
    const res = await fetch(`${base}/v1/me/affinities/${DEMO_USERS[1]!.id}`);
    expect(res.status).toBe(401);
  });
});

describe('almas gemelas y perfil público (fase 6)', () => {
  const byHandle = (handle: string) => DEMO_USERS.find((u) => u.handle === handle)!;

  it('GET /v1/me/soulmates: ranking de la demo con las personas sintéticas, sin el propio usuario', async () => {
    const res = await get('/v1/me/soulmates');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SoulmatesDto;
    expect(body.limit).toBe(50);
    const handles = body.items.map((i) => DEMO_USERS.find((u) => u.id === i.userId)!.handle);
    expect(handles).not.toContain(laura.handle);
    // Clara es la gemela sintética de Laura: primera. Pau (gustos contrarios) queda por debajo de Clara.
    expect(handles[0]).toBe('demo_clara');
    expect(handles.indexOf('demo_pau')).toBeGreaterThan(0);
    expect(body.items[0]!.score).toBeGreaterThan(body.items.find((i) => i.userId === byHandle('demo_pau').id)!.score);
    // Sam no tiene evidencia: no aparece (nunca con un 0 inventado).
    expect(handles).not.toContain('demo_sam');
    expect(JSON.stringify(body)).not.toMatch(/itemId|title|catalog/);
  });

  it('GET /v1/people/:id: perfil mínimo con las 8 afinidades y sin historial', async () => {
    const res = await get(`/v1/people/${byHandle('demo_clara').id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PublicPersonDto;
    expect(Object.keys(body).sort()).toEqual(['affinity', 'avatarUrl', 'chat', 'countryCode', 'displayName', 'friendship', 'userId']);
    expect(body.friendship).toEqual({ state: 'none', requestId: null });
    expect(body.chat).toEqual({ state: 'none' });
    expect(body.displayName).toBe('Clara (demo)');
    expect(body.affinity.categories).toHaveLength(8);
    expect(body.affinity.categories.some((c) => c.score === null)).toBe(true);
  });

  it('un bloqueo en cualquier dirección oculta a la persona del ranking y de su perfil', async () => {
    const clara = byHandle('demo_clara').id;
    await db.db.insert(userBlocks).values({ blockerUserId: clara, blockedUserId: laura.id });
    const body = (await (await get('/v1/me/soulmates')).json()) as SoulmatesDto;
    expect(body.items.map((i) => i.userId)).not.toContain(clara);
    expect((await get(`/v1/people/${clara}`)).status).toBe(404);
    expect((await get(`/v1/me/affinities/${clara}`)).status).toBe(404);
    await db.db.delete(userBlocks);
  });
});

describe('recomendaciones (fase 7)', () => {
  it('GET /v1/me/recommendations: tarjetas con motivo verificable, sin historiales ni ubicaciones ajenas', async () => {
    const res = await get('/v1/me/recommendations?limit=20');
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecommendationsDto;
    expect(body.algorithmVersion).toBe('recommendation-v1');
    expect(body.trending.year).toBe(new Date().getFullYear());
    for (const r of body.items) {
      expect(r.reason.code).toBe(r.block);
      expect(r.item.title).toBeTruthy();
      if (r.block === 'consensus') expect(r.reason.supporters).toBeGreaterThanOrEqual(2);
      if (r.block === 'discovery') expect(r.reason.contributor?.displayName).toBeTruthy();
    }
    // Ninguna tarjeta es algo que Laura ya conoce.
    const known = (await (await get('/v1/me/item-profiles')).json()) as { items?: Array<{ item: { id: string }; knownConfidence: number }> } | Array<{ item: { id: string }; knownConfidence: number }>;
    const list = Array.isArray(known) ? known : (known.items ?? []);
    const knownIds = new Set(list.filter((p) => p.knownConfidence >= 0.8).map((p) => p.item.id));
    expect(knownIds.size).toBeGreaterThan(0);
    expect(body.items.filter((r) => knownIds.has(r.item.id))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/latitude.*voter|voterId|userItemProfiles/);
  });

  it('exclude evita repetir tarjetas de la sesión y los parámetros se validan', async () => {
    const first = (await (await get('/v1/me/recommendations?limit=5')).json()) as RecommendationsDto;
    if (first.items.length) {
      const again = (await (await get(`/v1/me/recommendations?limit=5&exclude=${first.items[0]!.item.id}`)).json()) as RecommendationsDto;
      expect(again.items.map((r) => r.item.id)).not.toContain(first.items[0]!.item.id);
    }
    expect((await get('/v1/me/recommendations?category=inventada')).status).toBe(400);
    expect((await get('/v1/me/recommendations?limit=500')).status).toBe(400);
  });
});

describe('Home (fase 8)', () => {
  const post = (path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it('impresión, descartar, deshacer y conservar por HTTP; NEW cambia tras la primera impresión', async () => {
    const first = (await (await get('/v1/me/recommendations?limit=5')).json()) as RecommendationsDto;
    expect(first.items.length).toBeGreaterThan(0);
    const card = first.items[0]!;
    expect(card.isNew).toBe(true);
    expect(await (await post('/v1/me/home/impressions', { itemId: card.item.id })).json()).toEqual({ isNew: true });
    expect(await (await post('/v1/me/home/impressions', { itemId: card.item.id })).json()).toEqual({ isNew: false });
    expect((await post('/v1/me/home/actions', { itemId: card.item.id, action: 'dismiss' })).status).toBe(200);
    const afterDismiss = (await (await get('/v1/me/recommendations?limit=20')).json()) as RecommendationsDto;
    expect(afterDismiss.items.map((r) => r.item.id)).not.toContain(card.item.id);
    expect(await (await post('/v1/me/home/undo')).json()).toEqual({ itemId: card.item.id, action: 'dismiss' });
    const afterUndo = (await (await get('/v1/me/recommendations?limit=20')).json()) as RecommendationsDto;
    expect(afterUndo.items.find((r) => r.item.id === card.item.id)?.isNew).toBe(false);
    expect((await post('/v1/me/home/undo')).status).toBe(404);
  });

  it('valida el cuerpo y no admite objetos de otro dataset', async () => {
    expect((await post('/v1/me/home/actions', { itemId: 'no-uuid', action: 'dismiss' })).status).toBe(400);
    expect((await post('/v1/me/home/actions', { itemId: '10000000-0000-4000-a000-00000000dead', action: 'like' })).status).toBe(400);
    expect((await post('/v1/me/home/actions', { itemId: '10000000-0000-4000-a000-00000000dead', action: 'dismiss' })).status).toBe(404);
  });
});

describe('feed continuo y Categories (fase 9)', () => {
  const query = (body: unknown) =>
    fetch(`${base}/v1/me/recommendations/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('POST /query pagina con la cola de la sesión en el cuerpo, sin repetir y con respaldos etiquetados', async () => {
    const seen: string[] = [];
    for (let page = 0; page < 3; page++) {
      const body = (await (await query({ limit: 10, context: 'home', exclude: seen })).json()) as RecommendationsDto;
      for (const r of body.items) {
        expect(seen).not.toContain(r.item.id);
        seen.push(r.item.id);
        expect(['consensus', 'discovery', 'trending', 'community', 'kept', 'explore']).toContain(r.reason.code);
      }
    }
    expect(seen.length).toBeGreaterThan(10);
  });

  it('Categories: solo la categoría pedida', async () => {
    const body = (await (await query({ limit: 20, category: 'food', context: 'category' })).json()) as RecommendationsDto;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((r) => r.item.category === 'food')).toBe(true);
    expect((await query({ limit: 20, exclude: ['no-uuid'] })).status).toBe(400);
  });
});

describe('People y Friends (fase 10)', () => {
  async function tokenFor(handle: string) {
    const res = await fetch(`${base}/v1/dev/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) });
    return ((await res.json()) as { token: string }).token;
  }
  const call = (tok: string, method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it('solicitud, aceptación, perfil con la relación y eliminación por HTTP', async () => {
    const clara = DEMO_USERS.find((u) => u.handle === 'demo_clara')!;
    const claraToken = await tokenFor('demo_clara');
    expect(await (await call(token, 'POST', '/v1/me/friends/requests', { userId: clara.id })).json()).toEqual({ state: 'pending_out' });
    const incoming = ((await (await call(claraToken, 'GET', '/v1/me/friends')).json()) as FriendsDto).incoming;
    expect(incoming.map((f) => f.userId)).toEqual([laura.id]);
    // Laura no puede aceptar su propia solicitud, ni una tercera persona la de otra.
    expect((await call(await tokenFor('demo_leo'), 'POST', `/v1/me/friends/requests/${incoming[0]!.requestId}/reject`)).status).toBe(404);
    expect((await call(token, 'POST', `/v1/me/friends/requests/${incoming[0]!.requestId}/accept`)).status).toBe(404);
    expect(await (await call(claraToken, 'POST', `/v1/me/friends/requests/${incoming[0]!.requestId}/accept`)).json()).toEqual({ state: 'friends' });
    const person = (await (await get(`/v1/people/${clara.id}`)).json()) as PublicPersonDto;
    expect(person.friendship.state).toBe('friends');
    expect((await call(token, 'DELETE', `/v1/me/friends/${clara.id}`)).status).toBe(204);
  });

  it('bloquear, listar bloqueados, desbloquear y reportar; ajuste de privacidad', async () => {
    const pau = DEMO_USERS.find((u) => u.handle === 'demo_pau')!;
    expect((await call(token, 'POST', '/v1/me/blocks', { userId: pau.id })).status).toBe(204);
    expect(await (await call(token, 'GET', '/v1/me/blocks')).json()).toEqual([{ userId: pau.id, displayName: 'Pau (demo)' }]);
    expect((await get(`/v1/people/${pau.id}`)).status).toBe(404);
    expect((await call(token, 'POST', '/v1/me/reports', { userId: pau.id, reason: 'spam' })).status).toBe(204);
    expect((await call(token, 'POST', '/v1/me/reports', { userId: pau.id, reason: 'inventado' })).status).toBe(400);
    expect((await call(token, 'DELETE', `/v1/me/blocks/${pau.id}`)).status).toBe(204);
    expect((await call(token, 'DELETE', `/v1/me/blocks/${pau.id}`)).status).toBe(404);
    const patched = await call(token, 'PATCH', '/v1/me/settings', { discoverableAsSoulmate: false });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { settings: { discoverableAsSoulmate: boolean } }).settings.discoverableAsSoulmate).toBe(false);
    await call(token, 'PATCH', '/v1/me/settings', { discoverableAsSoulmate: true });
  });
});

describe('Chat (fase 12A)', () => {
  async function tokenFor(handle: string) {
    const res = await fetch(`${base}/v1/dev/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) });
    return ((await res.json()) as { token: string }).token;
  }
  const call = (tok: string, method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it('configuración: EARLY_ACCESS activo y nadie es Premium sin RevenueCat', async () => {
    const config = (await (await call(token, 'GET', '/v1/me/chats/config')).json()) as ChatConfigDto;
    expect(config).toMatchObject({ earlyAccess: true, premium: false, premiumSource: 'revenuecat' });
    const iris = DEMO_USERS.find((u) => u.handle === 'demo_iris')!;
    expect((await call(token, 'POST', '/v1/me/chats/direct', { userId: iris.id, body: 'hola' })).status).toBe(403);
  });

  it('interés, aceptación, mensajes y acceso solo de los miembros', async () => {
    const iris = DEMO_USERS.find((u) => u.handle === 'demo_iris')!;
    const irisToken = await tokenFor('demo_iris');
    const leoToken = await tokenFor('demo_leo');
    expect(await (await call(token, 'POST', '/v1/me/chats/requests', { userId: iris.id })).json()).toEqual({ state: 'request_sent', conversationId: null, newMatch: false });
    const person = (await (await call(token, 'GET', `/v1/people/${iris.id}`)).json()) as PublicPersonDto;
    expect(person.chat).toEqual({ state: 'request_sent', kind: 'interest' });
    const inbox = (await (await call(irisToken, 'GET', '/v1/me/chats')).json()) as ChatInboxDto;
    expect(inbox.requests.map((r) => r.person.userId)).toEqual([laura.id]);
    // Una solicitud solo la responde quien la recibe.
    expect((await call(leoToken, 'POST', `/v1/me/chats/requests/${inbox.requests[0]!.requestId}/accept`)).status).toBe(404);
    expect((await call(leoToken, 'POST', `/v1/me/chats/requests/${inbox.requests[0]!.requestId}/ignore`)).status).toBe(404);
    const match = (await (await call(irisToken, 'POST', `/v1/me/chats/requests/${inbox.requests[0]!.requestId}/accept`)).json()) as ChatMatchResultDto;
    expect(match).toMatchObject({ state: 'matched', newMatch: true });
    const conv = match.conversationId!;
    const sent = await call(token, 'POST', `/v1/me/chats/${conv}/messages`, { body: 'Hola Iris', clientId: 'laura-1' });
    expect(sent.status).toBe(201);
    expect((await call(token, 'POST', `/v1/me/chats/${conv}/messages`, { body: '' })).status).toBe(400);
    // Leo no es miembro: ni lee ni escribe.
    expect((await call(leoToken, 'GET', `/v1/me/chats/${conv}/messages`)).status).toBe(404);
    expect((await call(leoToken, 'POST', `/v1/me/chats/${conv}/messages`, { body: 'hola' })).status).toBe(404);
    expect((await call(leoToken, 'POST', `/v1/me/chats/${conv}/read`)).status).toBe(404);
    expect((await call(leoToken, 'DELETE', `/v1/me/chats/${conv}`)).status).toBe(404);
    const page = (await (await call(irisToken, 'GET', `/v1/me/chats/${conv}/messages`)).json()) as ChatConversationDto;
    expect(page.messages.map((m) => [m.body, m.mine])).toEqual([['Hola Iris', false]]);
    expect((await call(irisToken, 'POST', `/v1/me/chats/${conv}/read`)).status).toBe(204);
    // Bloquear detiene los mensajes.
    expect((await call(irisToken, 'POST', '/v1/me/blocks', { userId: laura.id })).status).toBe(204);
    expect((await call(token, 'POST', `/v1/me/chats/${conv}/messages`, { body: '¿sigues ahí?' })).status).toBe(404);
    expect((await call(irisToken, 'DELETE', `/v1/me/blocks/${laura.id}`)).status).toBe(204);
  });
});

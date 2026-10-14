import { catalogItems, createDatabase, userAffinities, userItemProfiles, userReports, userSettings, type DatabaseHandle } from '@appinity/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  blockUser,
  canSeePerson,
  createOrResetLocalUser,
  friendshipState,
  listBlocked,
  listFriends,
  recomputeAffinities,
  removeFriendship,
  reportUser,
  respondFriendRequest,
  seedDemoUsers,
  sendFriendRequest,
  topSoulmates,
  unblockUser,
} from '../src/index.js';

/** Personas SINTÉTICAS (dataset live, «test_social_*»). */
let database: DatabaseHandle;
const id: Record<string, string> = {};
const DEMO_LAURA = '00000000-0000-4000-a000-000000000001';

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  for (const name of ['ana', 'bea', 'carla', 'dani']) {
    id[name] = (await createOrResetLocalUser(database.db, { handle: `test_social_${name}`, displayName: `Sintética ${name}` })).userId;
  }
});

afterAll(async () => {
  await database?.close();
});

describe('amistad', () => {
  it('solicitud, aceptación y lista de amigos (aunque no haya afinidad: «—»)', async () => {
    expect(await sendFriendRequest(database.db, id.ana!, id.bea!)).toEqual({ state: 'pending_out' });
    // Reenviar no duplica.
    expect(await sendFriendRequest(database.db, id.ana!, id.bea!)).toEqual({ state: 'pending_out' });
    expect(await friendshipState(database.db, id.bea!, id.ana!)).toMatchObject({ state: 'pending_in' });
    const { incoming } = await listFriends(database.db, id.bea!);
    expect(incoming.map((f) => f.userId)).toEqual([id.ana]);
    // Solo quien recibe puede responder.
    await expect(respondFriendRequest(database.db, id.ana!, incoming[0]!.requestId, true)).rejects.toBeInstanceOf(NotFoundError);
    expect(await respondFriendRequest(database.db, id.bea!, incoming[0]!.requestId, true)).toEqual({ state: 'friends' });
    const anaFriends = await listFriends(database.db, id.ana!);
    expect(anaFriends.friends).toEqual([expect.objectContaining({ userId: id.bea, affinity: null })]);
    await expect(sendFriendRequest(database.db, id.ana!, id.bea!)).rejects.toBeInstanceOf(ConflictError);
  });

  it('pedir amistad a quien ya te la pidió equivale a aceptarla', async () => {
    await sendFriendRequest(database.db, id.carla!, id.dani!);
    expect(await sendFriendRequest(database.db, id.dani!, id.carla!)).toEqual({ state: 'friends' });
  });

  it('un rechazo no se revela: quien envió la solicitud la sigue viendo pendiente y no puede insistir', async () => {
    await sendFriendRequest(database.db, id.ana!, id.carla!);
    const [request] = (await listFriends(database.db, id.carla!)).incoming;
    expect(await respondFriendRequest(database.db, id.carla!, request!.requestId, false)).toEqual({ state: 'none' });
    expect(await friendshipState(database.db, id.ana!, id.carla!)).toMatchObject({ state: 'pending_out' });
    expect(await sendFriendRequest(database.db, id.ana!, id.carla!)).toEqual({ state: 'pending_out' });
    expect((await listFriends(database.db, id.carla!)).incoming).toEqual([]);
    // Quien rechazó sí puede pedir amistad después.
    expect(await sendFriendRequest(database.db, id.carla!, id.ana!)).toEqual({ state: 'pending_out' });
    expect(await friendshipState(database.db, id.ana!, id.carla!)).toMatchObject({ state: 'pending_in' });
  });

  it('cancelar una solicitud enviada o eliminar una amistad; una recibida se rechaza, no se borra', async () => {
    await expect(removeFriendship(database.db, id.ana!, id.carla!)).rejects.toBeInstanceOf(ForbiddenError);
    await removeFriendship(database.db, id.carla!, id.ana!);
    await removeFriendship(database.db, id.dani!, id.carla!);
    expect(await friendshipState(database.db, id.carla!, id.dani!)).toMatchObject({ state: 'none' });
  });

  it('no se puede pedir amistad entre la demo y cuentas reales', async () => {
    await expect(sendFriendRequest(database.db, id.ana!, DEMO_LAURA)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('bloqueo y reporte', () => {
  it('bloquear rompe la amistad, oculta en ambos sentidos y se puede deshacer; solo veo a quien yo bloqueé', async () => {
    await blockUser(database.db, id.ana!, id.bea!);
    expect(await friendshipState(database.db, id.ana!, id.bea!)).toMatchObject({ state: 'none' });
    expect(await canSeePerson(database.db, id.ana!, id.bea!)).toBe(false);
    expect(await canSeePerson(database.db, id.bea!, id.ana!)).toBe(false);
    await expect(sendFriendRequest(database.db, id.bea!, id.ana!)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listBlocked(database.db, id.ana!)).toEqual([{ userId: id.bea, displayName: 'Sintética bea' }]);
    expect(await listBlocked(database.db, id.bea!)).toEqual([]);
    await unblockUser(database.db, id.ana!, id.bea!);
    expect(await canSeePerson(database.db, id.ana!, id.bea!)).toBe(true);
    await expect(unblockUser(database.db, id.ana!, id.bea!)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reportar guarda el motivo y puede bloquear a la vez; no se puede reportar a quien no se ve', async () => {
    await reportUser(database.db, id.carla!, id.dani!, { reason: 'spam', note: '  mensajes repetidos  ', block: true });
    const [report] = await database.db.select().from(userReports);
    expect(report).toMatchObject({ reporterId: id.carla, reportedId: id.dani, reason: 'spam', note: 'mensajes repetidos' });
    expect(await canSeePerson(database.db, id.carla!, id.dani!)).toBe(false);
    // Quien bloqueó puede añadir otro reporte; la persona bloqueada no puede reportar a quien no ve.
    await reportUser(database.db, id.carla!, id.dani!, { reason: 'other' });
    await expect(reportUser(database.db, id.dani!, id.carla!, { reason: 'other' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('privacidad de descubrimiento', () => {
  it('quien desactiva «aparecer como alma gemela» sale del ranking de los demás, pero sigue viendo el suyo', async () => {
    const eli = (await createOrResetLocalUser(database.db, { handle: 'test_social_eli', displayName: 'Sintética eli' })).userId;
    // Ana y Eli comparten gustos: hay afinidad en ambos sentidos.
    for (let i = 0; i < 5; i++) {
      const [item] = await database.db
        .insert(catalogItems)
        .values({ dataset: 'live', category: 'movies', itemType: 'movie', title: `Social ${i}`, normalizedTitle: `social ${i}`, createdVia: 'test' })
        .returning({ id: catalogItems.id });
      for (const u of [id.ana!, eli]) {
        await database.db.insert(userItemProfiles).values({
          userId: u,
          catalogItemId: item!.id,
          knownConfidence: 1,
          consumedConfidence: 1,
          preferenceScore: 1,
          preferenceConfidence: 1,
          preferenceBasis: 'explicit_rating',
          evidenceCount: 1,
          sourceCount: 1,
          consolidationVersion: 'test',
        });
      }
    }
    await recomputeAffinities(database.db);
    expect((await topSoulmates(database.db, id.ana!)).map((s) => s.userId)).toContain(eli);
    await database.db.update(userSettings).set({ discoverableAsSoulmate: false }).where(eq(userSettings.userId, eli));
    expect((await topSoulmates(database.db, id.ana!)).map((s) => s.userId)).not.toContain(eli);
    expect((await topSoulmates(database.db, eli)).map((s) => s.userId)).toContain(id.ana);
    // Las afinidades siguen calculadas (no se borra nada); solo cambia dónde aparece.
    expect((await database.db.select().from(userAffinities).where(eq(userAffinities.targetUserId, eli))).length).toBeGreaterThan(0);
    // Su perfil sigue accesible para quien ya la conoce (por ejemplo, como amiga).
    expect(await canSeePerson(database.db, id.ana!, eli)).toBe(true);
  });
});

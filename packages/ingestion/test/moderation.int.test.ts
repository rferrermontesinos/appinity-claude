import { catalogItems, createDatabase, userItemProfiles, users, type DatabaseHandle } from '@appinity/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  AccountSuspendedError,
  ConflictError,
  NotFoundError,
  canSeePerson,
  countPendingReports,
  createOrResetLocalUser,
  createSession,
  findModerationTarget,
  findOrCreateUserForIdentity,
  listFriends,
  listReports,
  markReportsReviewed,
  recomputeAffinities,
  reportUser,
  respondFriendRequest,
  sendFriendRequest,
  sessionIsActive,
  suspendUser,
  topSoulmates,
  unsuspendUser,
} from '../src/index.js';

/** Moderación de la beta (B9). Personas SINTÉTICAS (dataset live, «test_mod_*»). */
let database: DatabaseHandle;
const id: Record<string, string> = {};
const at = (minute: number) => new Date(Date.UTC(2030, 0, 1, 12, minute));

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  for (const name of ['ana', 'bea', 'eva']) {
    id[name] = (await createOrResetLocalUser(database.db, { handle: `test_mod_${name}`, displayName: `Sintética ${name}` })).userId;
  }
  // Los mismos gustos: son almas gemelas entre sí.
  const items: string[] = [];
  for (const key of ['a', 'b', 'c', 'd']) {
    const [row] = await database.db
      .insert(catalogItems)
      .values({ dataset: 'live', category: 'movies', itemType: 'movie', title: `Sintético ${key}`, normalizedTitle: `sintetico ${key}`, createdVia: 'test' })
      .returning({ id: catalogItems.id });
    items.push(row!.id);
  }
  for (const name of ['ana', 'bea', 'eva']) {
    for (const catalogItemId of items) {
      await database.db.insert(userItemProfiles).values({
        userId: id[name]!,
        catalogItemId,
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
  await sendFriendRequest(database.db, id.ana!, id.bea!);
  const [request] = (await listFriends(database.db, id.bea!)).incoming;
  await respondFriendRequest(database.db, id.bea!, request!.requestId, true);
});

afterAll(async () => {
  await database?.close();
});

describe('reportes (pnpm reports:list)', () => {
  it('agrupa por persona reportada, la del reporte más reciente primero, y marca como revisados solo los indicados', async () => {
    await reportUser(database.db, id.ana!, id.bea!, { reason: 'harassment', note: 'Mensajes desagradables' }, at(1));
    await reportUser(database.db, id.eva!, id.bea!, { reason: 'spam' }, at(2));
    await reportUser(database.db, id.bea!, id.eva!, { reason: 'other' }, at(3));

    const people = await listReports(database.db);
    expect(people.map((p) => p.handle)).toEqual(['test_mod_eva', 'test_mod_bea']);
    expect(people[1]).toMatchObject({ displayName: 'Sintética bea', dataset: 'live', status: 'active', suspendedAt: null });
    expect(people[1]!.reports).toEqual([
      expect.objectContaining({ reason: 'spam', note: null, reporterHandle: 'test_mod_eva', reviewedAt: null }),
      expect.objectContaining({ reason: 'harassment', note: 'Mensajes desagradables', reporterHandle: 'test_mod_ana' }),
    ]);
    expect(await countPendingReports(database.db)).toBe(3);

    expect(
      await markReportsReviewed(
        database.db,
        people[1]!.reports.map((r) => r.id),
      ),
    ).toBe(2);
    expect(
      await markReportsReviewed(
        database.db,
        people[1]!.reports.map((r) => r.id),
      ),
    ).toBe(0);
    expect(await countPendingReports(database.db)).toBe(1);
    expect((await listReports(database.db)).map((p) => p.handle)).toEqual(['test_mod_eva']);
    const all = await listReports(database.db, { includeReviewed: true });
    expect(all.find((p) => p.handle === 'test_mod_bea')!.reports.every((r) => r.reviewedAt instanceof Date)).toBe(true);
    expect(await findModerationTarget(database.db, '@test_mod_eva')).toMatchObject({ userId: id.eva, pendingReports: 1 });
    await expect(findModerationTarget(database.db, 'test_mod_nadie')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('suspender una cuenta (pnpm account:suspend y account:unsuspend)', () => {
  it('cierra sus sesiones y la persona desaparece para los demás; al levantarla, todo vuelve como estaba', async () => {
    const session = await createSession(database.db, id.bea!);
    expect(await canSeePerson(database.db, id.ana!, id.bea!)).toBe(true);
    expect((await topSoulmates(database.db, id.ana!)).map((s) => s.userId)).toContain(id.bea);

    expect(await suspendUser(database.db, id.bea!, at(10))).toEqual({ sessionsRevoked: 1 });
    expect(await sessionIsActive(database.db, session.sessionId, id.bea!)).toBe(false);
    expect(await findModerationTarget(database.db, 'test_mod_bea')).toMatchObject({ status: 'suspended', suspendedAt: at(10) });
    expect(await canSeePerson(database.db, id.ana!, id.bea!)).toBe(false);
    expect((await topSoulmates(database.db, id.ana!)).map((s) => s.userId)).not.toContain(id.bea);
    expect((await listFriends(database.db, id.ana!)).friends).toEqual([]);
    // Fuera de la afinidad (y de la rareza) en el siguiente recálculo.
    expect((await recomputeAffinities(database.db)).find((r) => r.dataset === 'live')).toMatchObject({ eligibleUsers: 2 });
    await expect(suspendUser(database.db, id.bea!)).rejects.toBeInstanceOf(ConflictError);
    // Un código nuevo de cuenta local tampoco la levanta.
    await expect(createOrResetLocalUser(database.db, { handle: 'test_mod_bea', displayName: 'Otra' })).rejects.toBeInstanceOf(ConflictError);
    expect(await findModerationTarget(database.db, 'test_mod_bea')).toMatchObject({ status: 'suspended', displayName: 'Sintética bea' });

    await unsuspendUser(database.db, id.bea!);
    await expect(unsuspendUser(database.db, id.bea!)).rejects.toBeInstanceOf(ConflictError);
    expect(await findModerationTarget(database.db, 'test_mod_bea')).toMatchObject({ status: 'active', suspendedAt: null });
    expect(await canSeePerson(database.db, id.ana!, id.bea!)).toBe(true);
    expect((await listFriends(database.db, id.ana!)).friends.map((f) => f.userId)).toEqual([id.bea]);
    expect((await recomputeAffinities(database.db)).find((r) => r.dataset === 'live')).toMatchObject({ eligibleUsers: 3 });
    expect((await topSoulmates(database.db, id.ana!)).map((s) => s.userId)).toContain(id.bea);
    // Las sesiones cerradas no vuelven: tiene que entrar otra vez.
    expect(await sessionIsActive(database.db, session.sessionId, id.bea!)).toBe(false);
  });

  it('una cuenta suspendida no puede iniciar sesión con Google, y lo dice', async () => {
    const identity = { provider: 'google' as const, subject: 'sub-test-mod-fede', email: 'fede@example.com', name: 'Fede' };
    const { userId } = await findOrCreateUserForIdentity(database.db, identity);
    await suspendUser(database.db, userId);
    await expect(findOrCreateUserForIdentity(database.db, identity)).rejects.toBeInstanceOf(AccountSuspendedError);
    await unsuspendUser(database.db, userId);
    expect(await findOrCreateUserForIdentity(database.db, identity)).toEqual({ userId, isNew: false });
  });

  it('la base de datos no admite una suspensión sin fecha', async () => {
    await expect(database.db.update(users).set({ status: 'suspended' }).where(eq(users.id, id.eva!))).rejects.toThrow();
  });
});

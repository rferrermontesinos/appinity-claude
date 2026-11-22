import { conversations, createDatabase, invitations, type DatabaseHandle } from '@appinity/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { NotFoundError, acceptInvitation, blockUser, createInvitation, createOrResetLocalUser, friendshipState, previewInvitation } from '../src/index.js';

let database: DatabaseHandle;
let ana: string;
let ben: string;
let carla: string;

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 2 });
  await truncateAll(database.db);
  ana = (await createOrResetLocalUser(database.db, { handle: 'test_inv_ana', displayName: 'Ana' })).userId;
  ben = (await createOrResetLocalUser(database.db, { handle: 'test_inv_ben', displayName: 'Ben' })).userId;
  carla = (await createOrResetLocalUser(database.db, { handle: 'test_inv_carla', displayName: 'Carla' })).userId;
});

afterAll(async () => {
  await database.close();
});

describe('invitaciones por enlace', () => {
  it('reutiliza la invitación vigente; el código es aleatorio de 10 caracteres', async () => {
    const a = await createInvitation(database.db, ana);
    const b = await createInvitation(database.db, ana);
    expect(a.code).toMatch(/^[a-z2-9]{10}$/);
    expect(b.code).toBe(a.code);
  });

  it('vista previa: solo el nombre de quien invita; la propia invitación no sirve', async () => {
    const { code } = await createInvitation(database.db, ana);
    await expect(previewInvitation(database.db, code, ben)).resolves.toEqual({ inviterId: ana, inviterName: 'Ana' });
    await expect(previewInvitation(database.db, code, ana)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('aceptar crea la amistad y abre el chat; repetir no duplica ni cuenta otro uso', async () => {
    const { code } = await createInvitation(database.db, ana);
    await expect(acceptInvitation(database.db, code.toUpperCase(), ben)).resolves.toEqual({ inviterId: ana, state: 'friends' });
    await acceptInvitation(database.db, code, ben);
    expect((await friendshipState(database.db, ben, ana)).state).toBe('friends');
    expect((await database.db.select().from(conversations)).length).toBe(1);
    const [row] = await database.db.select().from(invitations).where(eq(invitations.code, code));
    expect(row!.uses).toBe(1);
  });

  it('un bloqueo, una invitación caducada o un código inventado no funcionan', async () => {
    const { code } = await createInvitation(database.db, ana);
    await blockUser(database.db, carla, ana);
    await expect(acceptInvitation(database.db, code, carla)).rejects.toBeInstanceOf(NotFoundError);
    await database.db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.code, code));
    await expect(previewInvitation(database.db, code, ben)).rejects.toBeInstanceOf(NotFoundError);
    await expect(previewInvitation(database.db, 'zzzzzzzzzz', ben)).rejects.toBeInstanceOf(NotFoundError);
  });
});

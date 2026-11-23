import { createDatabase, feedback, users, type DatabaseHandle } from '@appinity/database';
import { FEEDBACK_MAX_LENGTH, FEEDBACK_PER_DAY } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  RateLimitedError,
  countUnreadFeedback,
  createOrResetLocalUser,
  exportAccountData,
  listFeedback,
  markFeedbackRead,
  submitFeedback,
} from '../src/index.js';

/** Comentarios de la beta (fase B5). Personas SINTÉTICAS: cuentas locales «test_feedback_*». */
let database: DatabaseHandle;
let ana = '';
let bea = '';
const NOW = new Date('2026-11-22T10:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const comment = (message: string) => ({ message, appVersion: '0.1.0', platform: 'android' as const });

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 2 });
  await truncateAll(database.db);
  ana = (await createOrResetLocalUser(database.db, { handle: 'test_feedback_ana', displayName: 'Sintética Ana' })).userId;
  bea = (await createOrResetLocalUser(database.db, { handle: 'test_feedback_bea', displayName: 'Sintética Bea' })).userId;
});

afterAll(async () => {
  await database?.close();
});

describe('enviar un comentario', () => {
  it('guarda el texto sin espacios de más, con la versión y la plataforma, sin leer', async () => {
    const { id } = await submitFeedback(database.db, ana, { ...comment('  La tarjeta se queda en blanco al votar.\n'), platform: 'web' }, NOW);
    const [row] = await database.db.select().from(feedback).where(eq(feedback.id, id));
    expect(row).toMatchObject({ userId: ana, message: 'La tarjeta se queda en blanco al votar.', appVersion: '0.1.0', platform: 'web', readAt: null });
    expect(row!.createdAt.toISOString()).toBe(NOW.toISOString());
  });

  it(`como mucho ${FEEDBACK_PER_DAY} en 24 horas por persona; el cupo es de cada persona y se renueva`, async () => {
    for (let i = 1; i < FEEDBACK_PER_DAY; i++) await submitFeedback(database.db, ana, comment(`Comentario ${i}`), minutes(i));
    await expect(submitFeedback(database.db, ana, comment('Uno de más'), minutes(30))).rejects.toThrow(RateLimitedError);
    await expect(submitFeedback(database.db, ana, comment('Uno de más'), minutes(30))).rejects.toThrow(/vuelve a intentarlo mañana/);
    // Otra persona no comparte el cupo.
    await submitFeedback(database.db, bea, comment('Me gusta la tarjeta de votar'), minutes(31));
    // Pasadas 24 horas del primero, vuelve a haber hueco (solo uno: los demás siguen dentro de la ventana).
    await submitFeedback(database.db, ana, comment('Al día siguiente'), minutes(24 * 60 + 1));
    await expect(submitFeedback(database.db, ana, comment('Otro más'), minutes(24 * 60 + 1))).rejects.toThrow(RateLimitedError);
  });

  it('la base de datos rechaza un texto vacío o demasiado largo aunque no pase por la API', async () => {
    const insert = (message: string) => database.db.insert(feedback).values({ userId: bea, message, appVersion: '0.1.0', platform: 'ios' });
    await expect(insert('')).rejects.toThrow();
    await expect(insert('x'.repeat(FEEDBACK_MAX_LENGTH + 1))).rejects.toThrow();
  });
});

describe('leerlos (pnpm feedback:list)', () => {
  it('por defecto, solo los no leídos, los más recientes primero, con el handle y el nombre', async () => {
    const entries = await listFeedback(database.db);
    expect(entries).toHaveLength(FEEDBACK_PER_DAY + 2);
    expect(entries[0]).toMatchObject({ handle: 'test_feedback_ana', displayName: 'Sintética Ana', dataset: 'live', message: 'Al día siguiente', readAt: null });
    expect(entries.at(-1)!.message).toBe('La tarjeta se queda en blanco al votar.');
    const times = entries.map((e) => e.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect((await listFeedback(database.db, { limit: 3 })).map((e) => e.message)).toEqual(entries.slice(0, 3).map((e) => e.message));
    expect(await countUnreadFeedback(database.db)).toBe(FEEDBACK_PER_DAY + 2);
  });

  it('marcar como leídos: cuenta solo los que cambian; --all los vuelve a enseñar', async () => {
    const firstThree = (await listFeedback(database.db, { limit: 3 })).map((e) => e.id);
    expect(await markFeedbackRead(database.db, firstThree, minutes(2 * 24 * 60))).toBe(3);
    expect(await markFeedbackRead(database.db, firstThree)).toBe(0);
    expect(await markFeedbackRead(database.db, [])).toBe(0);
    const unread = await listFeedback(database.db);
    expect(unread.map((e) => e.id)).not.toContain(firstThree[0]);
    expect(await countUnreadFeedback(database.db)).toBe(FEEDBACK_PER_DAY - 1);
    const all = await listFeedback(database.db, { includeRead: true });
    expect(all).toHaveLength(FEEDBACK_PER_DAY + 2);
    expect(
      all
        .filter((e) => e.readAt)
        .map((e) => e.id)
        .sort(),
    ).toEqual([...firstThree].sort());
  });
});

describe('derechos de la persona', () => {
  it('sus comentarios salen en su copia de datos, y solo los suyos', async () => {
    const data = await exportAccountData(database.db, bea);
    // El de Bea estaba entre los tres marcados como leídos: la copia dice cuándo.
    expect(data.feedback).toEqual([
      expect.objectContaining({
        message: 'Me gusta la tarjeta de votar',
        appVersion: '0.1.0',
        platform: 'android',
        readAt: minutes(2 * 24 * 60).toISOString(),
      }),
    ]);
    expect((await exportAccountData(database.db, ana)).feedback).toHaveLength(FEEDBACK_PER_DAY + 1);
  });

  it('al borrar la cuenta se borran sus comentarios', async () => {
    await database.db.delete(users).where(eq(users.id, bea));
    expect(await database.db.select().from(feedback).where(eq(feedback.userId, bea))).toEqual([]);
    expect((await listFeedback(database.db, { includeRead: true })).every((e) => e.handle === 'test_feedback_ana')).toBe(true);
  });
});

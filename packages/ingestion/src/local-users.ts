import {
  generateLocalCode,
  hashLocalCode,
  userProfiles,
  userSettings,
  users,
  type Database,
} from '@appinity/database';
import { eq, sql } from 'drizzle-orm';
import { ConflictError } from './errors.js';

/**
 * Cuenta local REAL (dataset live) para probar integraciones con datos propios mientras no exista la autenticación de
 * producción. Solo funciona con la identidad de desarrollo (DEMO_MODE, fuera de producción) y exige un código que se
 * muestra una única vez. Si la cuenta existe, se genera un código nuevo y el anterior deja de valer.
 */
export async function createOrResetLocalUser(
  db: Database,
  input: { handle: string; displayName: string; countryCode?: string },
): Promise<{ userId: string; code: string; created: boolean }> {
  if (process.env.NODE_ENV === 'production') throw new Error('Las cuentas locales están prohibidas en producción');
  if (!/^[a-z0-9_]{3,32}$/.test(input.handle) || input.handle.startsWith('demo_')) {
    throw new Error('El handle debe tener 3–32 caracteres [a-z0-9_] y no empezar por demo_');
  }
  const code = generateLocalCode();
  const hash = hashLocalCode(code);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.handle, input.handle));
    if (existing && existing.dataset !== 'live') throw new ConflictError('Ese handle pertenece a un usuario de demo');
    if (existing) {
      await tx.update(users).set({ localLoginCodeHash: hash, status: 'active', updatedAt: sql`now()` }).where(eq(users.id, existing.id));
      await tx
        .update(userProfiles)
        .set({ displayName: input.displayName, countryCode: input.countryCode ?? null, updatedAt: sql`now()` })
        .where(eq(userProfiles.userId, existing.id));
      return { userId: existing.id, code, created: false };
    }
    const [user] = await tx
      .insert(users)
      .values({ handle: input.handle, dataset: 'live', localLoginCodeHash: hash, adultConfirmedAt: new Date(), termsAcceptedAt: new Date() })
      .returning({ id: users.id });
    await tx.insert(userProfiles).values({ userId: user!.id, displayName: input.displayName, countryCode: input.countryCode ?? null });
    await tx.insert(userSettings).values({ userId: user!.id });
    return { userId: user!.id, code, created: true };
  });
}

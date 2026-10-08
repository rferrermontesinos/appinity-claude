import { sql } from 'drizzle-orm';
import { type Database, userProfiles, userSettings, users } from '@appinity/database';
import { DEMO_USERS } from './users.js';

/** Inserta o restablece los usuarios simulados. Repetirlo deja exactamente el mismo estado. */
export async function seedDemoUsers(db: Database): Promise<number> {
  await db.transaction(async (tx) => {
    for (const u of DEMO_USERS) {
      await tx
        .insert(users)
        .values({
          id: u.id,
          handle: u.handle,
          dataset: 'demo',
          status: 'active',
          demoNote: u.note,
          adultConfirmedAt: new Date('2026-01-01T00:00:00Z'),
          termsAcceptedAt: new Date('2026-01-01T00:00:00Z'),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { handle: u.handle, dataset: 'demo', status: 'active', demoNote: u.note, deletedAt: null, updatedAt: sql`now()` },
        });
      await tx
        .insert(userProfiles)
        .values({ userId: u.id, displayName: u.displayName, countryCode: u.countryCode })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: { displayName: u.displayName, countryCode: u.countryCode, avatarUrl: null, updatedAt: sql`now()` },
        });
      const settings = {
        locale: u.locale,
        timeZone: 'Europe/Madrid',
        radiusKm: 10,
        locationLabel: u.location.label,
        locationLatitude: u.location.latitude,
        locationLongitude: u.location.longitude,
        locationSource: 'manual' as const,
        locationUpdatedAt: new Date('2026-01-01T00:00:00Z'),
        discoverableByContacts: true,
        notificationFrequency: 'three_per_week' as const,
      };
      await tx
        .insert(userSettings)
        .values({ userId: u.id, ...settings })
        .onConflictDoUpdate({ target: userSettings.userId, set: { ...settings, updatedAt: sql`now()` } });
    }
  });
  return DEMO_USERS.length;
}

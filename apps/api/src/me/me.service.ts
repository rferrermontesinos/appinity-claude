import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { type DatabaseHandle, userProfiles, userSettings, users } from '@appinity/database';
import type { MeDto, SettingsDto } from '@appinity/shared';
import { DATABASE } from '../infra/tokens.js';

export interface SettingsPatch {
  locale?: 'es' | 'en';
  timeZone?: string;
  radiusKm?: number;
  discoverableByContacts?: boolean;
  notificationFrequency?: SettingsDto['notificationFrequency'];
  location?: { label: string; latitude: number; longitude: number; source: 'manual' | 'device' } | null;
}

/** Redondeo a 2 decimales (~1 km): se guarda una zona aproximada, no una posición exacta. */
export function approximateCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class MeService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async getMe(userId: string): Promise<MeDto> {
    const [row] = await this.database.db
      .select({ user: users, profile: userProfiles, settings: userSettings })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .innerJoin(userSettings, eq(userSettings.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new NotFoundException('Usuario no encontrado');
    const s = row.settings;
    return {
      user: {
        id: row.user.id,
        handle: row.user.handle,
        displayName: row.profile.displayName,
        countryCode: row.profile.countryCode,
        dataset: row.user.dataset,
      },
      settings: {
        locale: s.locale,
        radiusKm: s.radiusKm,
        timeZone: s.timeZone,
        discoverableByContacts: s.discoverableByContacts,
        notificationFrequency: s.notificationFrequency,
        location:
          s.locationLatitude !== null && s.locationLongitude !== null && s.locationSource
            ? {
                label: s.locationLabel ?? '',
                latitude: s.locationLatitude,
                longitude: s.locationLongitude,
                source: s.locationSource,
              }
            : null,
      },
      authKind: 'dev',
    };
  }

  async updateSettings(userId: string, patch: SettingsPatch): Promise<MeDto> {
    const set: Partial<typeof userSettings.$inferInsert> = {};
    if (patch.locale !== undefined) set.locale = patch.locale;
    if (patch.timeZone !== undefined) set.timeZone = patch.timeZone;
    if (patch.radiusKm !== undefined) set.radiusKm = patch.radiusKm;
    if (patch.discoverableByContacts !== undefined) set.discoverableByContacts = patch.discoverableByContacts;
    if (patch.notificationFrequency !== undefined) set.notificationFrequency = patch.notificationFrequency;
    if (patch.location !== undefined) {
      if (patch.location === null) {
        Object.assign(set, { locationLabel: null, locationLatitude: null, locationLongitude: null, locationSource: null });
      } else {
        Object.assign(set, {
          locationLabel: patch.location.label,
          locationLatitude: approximateCoordinate(patch.location.latitude),
          locationLongitude: approximateCoordinate(patch.location.longitude),
          locationSource: patch.location.source,
        });
      }
      set.locationUpdatedAt = new Date();
    }
    if (Object.keys(set).length > 0) {
      await this.database.db
        .update(userSettings)
        .set({ ...set, updatedAt: sql`now()` })
        .where(eq(userSettings.userId, userId));
    }
    return this.getMe(userId);
  }
}

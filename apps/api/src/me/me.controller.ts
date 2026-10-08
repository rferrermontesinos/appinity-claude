import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { MeDto } from '@appinity/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService, type SettingsPatch } from './me.service.js';

const timeZones = new Set(Intl.supportedValuesOf('timeZone'));

const settingsSchema = z
  .object({
    locale: z.enum(['es', 'en']).optional(),
    timeZone: z
      .string()
      .refine((tz) => timeZones.has(tz) || tz === 'UTC', 'Zona horaria IANA desconocida')
      .optional(),
    radiusKm: z.number().int().min(1).max(50).optional(),
    discoverableByContacts: z.boolean().optional(),
    notificationFrequency: z.enum(['daily', 'three_per_week', 'weekly', 'off']).optional(),
    location: z
      .object({
        label: z.string().trim().min(1).max(80),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        source: z.enum(['manual', 'device']),
      })
      .nullable()
      .optional(),
  })
  .strict();

/** Recursos del propio usuario: el userId sale siempre de la sesión, nunca de la URL. */
@Controller('v1/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() auth: AuthContext): Promise<MeDto> {
    return this.me.getMe(auth.userId);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>,
  ): Promise<MeDto> {
    return this.me.updateSettings(auth.userId, body as SettingsPatch);
  }
}

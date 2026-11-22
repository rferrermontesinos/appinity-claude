import { Body, Controller, Delete, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { notificationDeliveries, pushTokens, type DatabaseHandle } from '@appinity/database';
import { registerPushToken, unregisterPushToken } from '@appinity/ingestion';
import type { NotificationsStatusDto } from '@appinity/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE } from '../infra/tokens.js';

const tokenSchema = z.object({ token: z.string().min(10).max(200), platform: z.enum(['ios', 'android']) }).strict();
const removeSchema = z.object({ token: z.string().min(10).max(200) }).strict();

/**
 * Notificaciones push (fase 12C). La frecuencia y la zona horaria son ajustes del usuario (`PATCH /v1/me/settings`);
 * aquí solo se registran los dispositivos y se informa del último envío. Un token solo lo gestiona su dueño.
 */
@Controller('v1/me')
export class NotificationsController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  @Get('notifications')
  async status(@CurrentUser() auth: AuthContext): Promise<NotificationsStatusDto> {
    const db = this.database.db;
    const devices = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, auth.userId), isNull(pushTokens.disabledAt)));
    const [last] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, auth.userId))
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(1);
    return {
      devices: devices.length,
      lastDelivery: last ? { localDate: last.localDate, status: last.status, createdAt: last.createdAt.toISOString() } : null,
    };
  }

  @Post('push-tokens')
  @HttpCode(204)
  async register(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(tokenSchema)) body: z.infer<typeof tokenSchema>): Promise<void> {
    await registerPushToken(this.database.db, auth.userId, body.token, body.platform);
  }

  @Delete('push-tokens')
  @HttpCode(204)
  async remove(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(removeSchema)) body: z.infer<typeof removeSchema>): Promise<void> {
    await unregisterPushToken(this.database.db, auth.userId, body.token);
  }
}

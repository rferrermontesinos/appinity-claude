import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { DatabaseHandle } from '@appinity/database';
import { submitFeedback } from '@appinity/ingestion';
import { feedbackSchema, type FeedbackDto } from '@appinity/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE } from '../infra/tokens.js';

/**
 * Comentarios de la beta (fase B5): Perfil → «Enviar comentario». Con sesión (la persona escribe a APPINITY, así que se
 * sabe de quién es para poder contestarle), con la versión y la plataforma de la app y un cupo diario por persona
 * (429 al superarlo). El titular los lee con `pnpm feedback:list`.
 */
@Controller('v1/me')
export class FeedbackController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  @Post('feedback')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async send(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(feedbackSchema)) body: FeedbackDto): Promise<void> {
    await submitFeedback(this.database.db, auth.userId, body);
  }
}

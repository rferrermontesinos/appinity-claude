import { Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import { acceptInvitation, createInvitation, previewInvitation } from '@appinity/ingestion';
import type { InvitationAcceptDto, InvitationDto, InvitationPreviewDto } from '@appinity/shared';
import { z } from 'zod';
import { APP_ENV, type AppEnv } from '../config/env.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE } from '../infra/tokens.js';

const codeSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]{10}$/);

/**
 * Invitaciones por enlace (crecimiento por grupos de amigos). Todas requieren sesión: el código no revela nada a quien
 * no tiene cuenta, y la vista previa solo muestra el nombre visible de quien invita.
 */
@Controller()
export class InvitationsController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Post('v1/me/invitations')
  @HttpCode(200)
  async create(@CurrentUser() auth: AuthContext): Promise<InvitationDto> {
    const { code, expiresAt } = await createInvitation(this.database.db, auth.userId);
    // Vista web: la configurada o, en desarrollo, la del PC (8092).
    const web = (this.env.APP_WEB_ORIGIN ?? (this.env.NODE_ENV === 'production' ? undefined : 'http://localhost:8092'))?.replace(/\/+$/, '');
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      appUrl: `appinity-claude://invite/${code}`,
      ...(web ? { webUrl: `${web}/invite/${code}` } : {}),
    };
  }

  @Get('v1/invitations/:code')
  preview(@CurrentUser() auth: AuthContext, @Param('code', new ZodPipe(codeSchema)) code: string): Promise<InvitationPreviewDto> {
    return previewInvitation(this.database.db, code, auth.userId);
  }

  @Post('v1/invitations/:code/accept')
  @HttpCode(200)
  accept(@CurrentUser() auth: AuthContext, @Param('code', new ZodPipe(codeSchema)) code: string): Promise<InvitationAcceptDto> {
    return acceptInvitation(this.database.db, code, auth.userId);
  }
}

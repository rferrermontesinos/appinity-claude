import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import {
  blockUser,
  listBlocked,
  listFriends,
  removeFriendship,
  reportUser,
  respondFriendRequest,
  sendFriendRequest,
  unblockUser,
} from '@appinity/ingestion';
import type { BlockedPersonDto, FriendsDto, FriendshipResultDto } from '@appinity/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE } from '../infra/tokens.js';

const userSchema = z.object({ userId: z.uuid() }).strict();
const reportSchema = z
  .object({
    userId: z.uuid(),
    reason: z.enum(['spam', 'harassment', 'inappropriate', 'impersonation', 'other']),
    note: z.string().trim().max(500).optional(),
    block: z.boolean().default(false),
  })
  .strict();

/**
 * Amigos, bloqueos y reportes (§4, §16 y §17). Todo parte del usuario de la sesión; la otra persona tiene que poder
 * verse (mismo dataset, activa y sin bloqueos). Un reporte nunca se comunica a la persona reportada.
 */
@Controller('v1/me')
export class SocialController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  @Get('friends')
  friends(@CurrentUser() auth: AuthContext): Promise<FriendsDto> {
    return listFriends(this.database.db, auth.userId);
  }

  @Post('friends/requests')
  @HttpCode(200)
  request(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(userSchema)) body: z.infer<typeof userSchema>): Promise<FriendshipResultDto> {
    return sendFriendRequest(this.database.db, auth.userId, body.userId);
  }

  @Post('friends/requests/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<FriendshipResultDto> {
    return respondFriendRequest(this.database.db, auth.userId, id, true);
  }

  @Post('friends/requests/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<FriendshipResultDto> {
    return respondFriendRequest(this.database.db, auth.userId, id, false);
  }

  /** Eliminar amistad o cancelar la solicitud enviada. */
  @Delete('friends/:userId')
  @HttpCode(204)
  async remove(@CurrentUser() auth: AuthContext, @Param('userId', new ParseUUIDPipe()) userId: string): Promise<void> {
    await removeFriendship(this.database.db, auth.userId, userId);
  }

  @Get('blocks')
  blocks(@CurrentUser() auth: AuthContext): Promise<BlockedPersonDto[]> {
    return listBlocked(this.database.db, auth.userId);
  }

  @Post('blocks')
  @HttpCode(204)
  async block(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(userSchema)) body: z.infer<typeof userSchema>): Promise<void> {
    await blockUser(this.database.db, auth.userId, body.userId);
  }

  @Delete('blocks/:userId')
  @HttpCode(204)
  async unblock(@CurrentUser() auth: AuthContext, @Param('userId', new ParseUUIDPipe()) userId: string): Promise<void> {
    await unblockUser(this.database.db, auth.userId, userId);
  }

  @Post('reports')
  @HttpCode(204)
  async report(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(reportSchema)) body: z.infer<typeof reportSchema>): Promise<void> {
    await reportUser(this.database.db, auth.userId, body.userId, {
      reason: body.reason,
      block: body.block,
      ...(body.note ? { note: body.note } : {}),
    });
  }
}

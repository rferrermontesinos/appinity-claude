import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import {
  CHAT_LIMITS,
  chatInbox,
  conversationMessages,
  markConversationRead,
  respondChatRequest,
  sendChatInterest,
  sendDirectMessage,
  sendMessage,
  unmatch,
} from '@appinity/ingestion';
import type { ChatConfigDto, ChatConversationDto, ChatInboxDto, ChatMatchResultDto, ChatMessageDto } from '@appinity/shared';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE } from '../infra/tokens.js';
import { ChatPolicyService } from './chat-policy.service.js';

const body = z.string().trim().min(1).max(CHAT_LIMITS.bodyMaxLength);
const interestSchema = z.object({ userId: z.uuid() }).strict();
const directSchema = z.object({ userId: z.uuid(), body }).strict();
const messageSchema = z
  .object({ body, clientId: z.string().regex(/^[\w-]{1,64}$/).optional() })
  .strict();
const pageSchema = z
  .object({ before: z.iso.datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).optional() })
  .strict();

/**
 * Chat (§16, fase 12A): interés → match → conversación. Los permisos se validan aquí y en el dominio: solo miembros de
 * una conversación activa, sin bloqueos, leen o escriben. Ningún mensaje modifica gustos ni afinidades.
 */
@Controller('v1/me/chats')
export class ChatController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly policy: ChatPolicyService,
  ) {}

  @Get('config')
  config(@CurrentUser() auth: AuthContext): Promise<ChatConfigDto> {
    return this.policy.config(auth.userId);
  }

  @Get()
  inbox(@CurrentUser() auth: AuthContext): Promise<ChatInboxDto> {
    return chatInbox(this.database.db, auth.userId);
  }

  /** Interés por hablar (EARLY_ACCESS). Si es mutuo, match. */
  @Post('requests')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  interest(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(interestSchema)) input: z.infer<typeof interestSchema>): Promise<ChatMatchResultDto> {
    return sendChatInterest(this.database.db, this.policy, auth.userId, input.userId);
  }

  /** Primer mensaje sin match (PREMIUM_DIRECT_MESSAGE). 403 sin entitlement verificado. */
  @Post('direct')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  direct(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(directSchema)) input: z.infer<typeof directSchema>): Promise<ChatMatchResultDto> {
    return sendDirectMessage(this.database.db, this.policy, auth.userId, input.userId, input.body);
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<ChatMatchResultDto> {
    return respondChatRequest(this.database.db, auth.userId, id, 'accept');
  }

  /** Ignorar: no se avisa a quien la envió ni genera señales. */
  @Post('requests/:id/ignore')
  @HttpCode(204)
  async ignore(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await respondChatRequest(this.database.db, auth.userId, id, 'ignore');
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(pageSchema)) query: z.infer<typeof pageSchema>,
  ): Promise<ChatConversationDto> {
    return conversationMessages(this.database.db, auth.userId, id, {
      ...(query.before ? { before: new Date(query.before) } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }

  @Post(':id/messages')
  @HttpCode(201)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  send(
    @CurrentUser() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(messageSchema)) input: z.infer<typeof messageSchema>,
  ): Promise<ChatMessageDto> {
    return sendMessage(this.database.db, auth.userId, id, input.body, input.clientId);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await markConversationRead(this.database.db, auth.userId, id);
  }

  /** Deshacer el match: la conversación desaparece para ambas personas. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await unmatch(this.database.db, auth.userId, id);
  }
}

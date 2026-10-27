import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import { NotFoundError, applyHomeAction, assertItemVisible, castVote, enqueueAffinity, itemOpinion, recordImpression, undoLastHomeAction, type ProducerQueues } from '@appinity/ingestion';
import type { HomeActionResultDto, HomeImpressionResultDto, HomeUndoResultDto, HomeVoteResultDto, ItemOpinionDto } from '@appinity/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE, QUEUES } from '../infra/tokens.js';

const itemSchema = z.object({ itemId: z.uuid() }).strict();
const actionSchema = z.object({ itemId: z.uuid(), action: z.enum(['dismiss', 'keep']) }).strict();
const voteSchema = z.object({ itemId: z.uuid(), value: z.union([z.literal(-1), z.literal(1), z.literal(2)]) }).strict();

/**
 * Home (§2): impresiones, votos y acciones de la tarjeta. Guardar y descartar solo afectan a lo que se muestra; un voto
 * (2026-10-27) es una fuente declarada: cambia el perfil y, poco después, la afinidad.
 */
@Controller('v1/me/home')
export class HomeController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(QUEUES) private readonly queues: ProducerQueues,
  ) {}

  /** Votar una tarjeta: definitivo para esa obra (salvo deshacer). La afinidad se recalcula a los pocos segundos. */
  @Post('votes')
  @HttpCode(200)
  async vote(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(voteSchema)) body: z.infer<typeof voteSchema>): Promise<HomeVoteResultDto> {
    await assertItemVisible(this.database.db, auth.userId, body.itemId);
    const result = await castVote(this.database.db, auth.userId, body.itemId, body.value);
    if (result.profileChanged) await enqueueAffinity(this.queues, auth.userId);
    return { actionId: result.actionId };
  }

  /** La tarjeta se ha mostrado de verdad (no precargada). */
  /** Tu voto y si la guardaste, para la ficha (solo tus propios datos). */
  @Get('items/:id/opinion')
  async opinion(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<ItemOpinionDto> {
    await assertItemVisible(this.database.db, auth.userId, id);
    return itemOpinion(this.database.db, auth.userId, id);
  }

  @Post('impressions')
  @HttpCode(200)
  async impression(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(itemSchema)) body: z.infer<typeof itemSchema>): Promise<HomeImpressionResultDto> {
    return recordImpression(this.database.db, auth.userId, body.itemId);
  }

  @Post('actions')
  @HttpCode(200)
  async action(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(actionSchema)) body: z.infer<typeof actionSchema>): Promise<HomeActionResultDto> {
    return applyHomeAction(this.database.db, auth.userId, body.itemId, body.action);
  }

  /** Deshace la última acción vigente y devuelve el objeto para volver a mostrarlo. */
  @Post('undo')
  @HttpCode(200)
  async undo(@CurrentUser() auth: AuthContext): Promise<HomeUndoResultDto> {
    const result = await undoLastHomeAction(this.database.db, auth.userId);
    if (!result) throw new NotFoundError('No hay ninguna acción que deshacer');
    if (result.profileChanged) await enqueueAffinity(this.queues, auth.userId);
    return { itemId: result.itemId, action: result.action };
  }
}

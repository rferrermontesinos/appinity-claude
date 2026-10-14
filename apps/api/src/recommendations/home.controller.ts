import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import { NotFoundError, applyHomeAction, recordImpression, undoLastHomeAction } from '@appinity/ingestion';
import type { HomeActionResultDto, HomeImpressionResultDto, HomeUndoResultDto } from '@appinity/shared';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DATABASE } from '../infra/tokens.js';

const itemSchema = z.object({ itemId: z.uuid() }).strict();
const actionSchema = z.object({ itemId: z.uuid(), action: z.enum(['dismiss', 'keep']) }).strict();

/**
 * Home (§2): impresiones y acciones de la tarjeta. Todo parte del usuario de la sesión y solo afecta a lo que se muestra
 * en Home; nunca a gustos ni afinidades.
 */
@Controller('v1/me/home')
export class HomeController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** La tarjeta se ha mostrado de verdad (no precargada). */
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
    return result;
  }
}

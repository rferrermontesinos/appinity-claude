import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { ConnectStartDto, ConnectionDto, SyncRunDto } from '@appinity/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { publicBaseUrl } from '../common/base-url.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { ConnectionsService } from './connections.service.js';
import { isAllowedReturnUrl } from './return-url.js';

const connectSchema = z
  .object({
    sourceKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    /** URL de vuelta a la app tras autorizar en el proveedor (lista blanca, sin redirecciones abiertas). */
    returnUrl: z.string().max(512).refine(isAllowedReturnUrl, 'URL de vuelta no permitida').optional(),
  })
  .strict();
const syncSchema = z.object({ mode: z.enum(['incremental', 'full']).default('incremental') }).strict();

@Controller('v1/me/connections')
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get()
  list(@CurrentUser() auth: AuthContext): Promise<ConnectionDto[]> {
    return this.connections.list(auth.userId);
  }

  @Post()
  connect(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(connectSchema)) body: z.infer<typeof connectSchema>,
    @Req() req: Request,
  ): Promise<ConnectStartDto> {
    return this.connections.connect(auth.userId, body.sourceKey, publicBaseUrl(req, this.env), body.returnUrl);
  }

  @Post(':id/sync')
  sync(
    @CurrentUser() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(syncSchema)) body: z.infer<typeof syncSchema>,
  ): Promise<SyncRunDto> {
    return this.connections.startSync(auth.userId, id, 'user', body.mode);
  }

  @Get(':id/runs')
  runs(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string): Promise<SyncRunDto[]> {
    return this.connections.runs(auth.userId, id);
  }

  /** Desconecta. Con ?purge=true borra también lo importado de esta fuente y recalcula los perfiles. */
  @Delete(':id')
  disconnect(
    @CurrentUser() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('purge', new ZodPipe(z.enum(['true', 'false']).default('false'))) purge: 'true' | 'false',
  ) {
    return this.connections.disconnect(auth.userId, id, purge === 'true');
  }
}

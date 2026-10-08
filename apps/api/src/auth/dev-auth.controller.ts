import { Body, Controller, Get, HttpCode, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { DevSessionDto, DevUserDto } from '@appinity/shared';
import { verifyLocalCode } from '@appinity/database';
import { z } from 'zod';
import { Public } from '../common/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import { DevAuthService } from './dev-auth.service.js';
import { UsersRepository } from './users.repository.js';

const sessionSchema = z
  .object({
    handle: z.string().regex(/^[a-z0-9_]{3,32}$/),
    /** Código de una cuenta local real (pnpm user:local). No se usa con usuarios de demo. */
    code: z.string().trim().min(8).max(40).optional(),
  })
  .strict();

@Controller('v1/dev')
export class DevAuthController {
  constructor(
    private readonly devAuth: DevAuthService,
    private readonly users: UsersRepository,
    private readonly me: MeService,
  ) {}

  @Public()
  @Get('users')
  async listUsers(): Promise<DevUserDto[]> {
    if (!this.devAuth.enabled) throw new NotFoundException();
    const rows = await this.users.listActiveDemoUsers();
    return rows.map((r) => ({
      id: r.id,
      handle: r.handle,
      displayName: r.displayName,
      countryCode: r.countryCode,
      description: r.note ?? '',
    }));
  }

  @Public()
  @Post('session')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createSession(@Body(new ZodPipe(sessionSchema)) body: z.infer<typeof sessionSchema>): Promise<DevSessionDto> {
    if (!this.devAuth.enabled) throw new NotFoundException();
    const user = await this.users.findActiveByHandle(body.handle);
    const valid =
      user &&
      (user.dataset === 'demo'
        ? body.code === undefined
        : user.localLoginCodeHash !== null && body.code !== undefined && verifyLocalCode(body.code, user.localLoginCodeHash));
    // Misma respuesta para usuario inexistente, código erróneo o cuenta real sin código local.
    if (!user || !valid) throw new UnauthorizedException('Usuario o código no válidos');
    const { token, expiresAt } = await this.devAuth.issue(user.id, user.dataset === 'live' ? user.localLoginCodeHash : null);
    return { token, expiresAt, me: await this.me.getMe(user.id) };
  }
}

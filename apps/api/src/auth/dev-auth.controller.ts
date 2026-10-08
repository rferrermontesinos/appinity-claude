import { Body, Controller, Get, HttpCode, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { DevSessionDto, DevUserDto } from '@appinity/shared';
import { z } from 'zod';
import { Public } from '../common/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MeService } from '../me/me.service.js';
import { DevAuthService } from './dev-auth.service.js';
import { UsersRepository } from './users.repository.js';

const sessionSchema = z.object({ handle: z.string().regex(/^[a-z0-9_]{3,32}$/) });

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
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createSession(@Body(new ZodPipe(sessionSchema)) body: z.infer<typeof sessionSchema>): Promise<DevSessionDto> {
    if (!this.devAuth.enabled) throw new NotFoundException();
    const user = await this.users.findActiveDemoByHandle(body.handle);
    if (!user) throw new UnauthorizedException('Usuario de demo desconocido');
    const { token, expiresAt } = await this.devAuth.issue(user.id);
    return { token, expiresAt, me: await this.me.getMe(user.id) };
  }
}

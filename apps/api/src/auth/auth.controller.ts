import { Body, Controller, Delete, Get, HttpCode, Inject, Logger, Post, Query, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { users, type DatabaseHandle } from '@appinity/database';
import { completeOnboarding, createSession, findOrCreateUserForIdentity, revokeSession, rotateSession } from '@appinity/ingestion';
import type { AuthProvidersDto, AuthSessionDto } from '@appinity/shared';
import { Throttle } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Public } from '../common/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { isAllowedReturnUrl } from '../connections/return-url.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { DATABASE, REDIS } from '../infra/tokens.js';
import type { AuthContext } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { DevAuthService } from './dev-auth.service.js';
import { GoogleOidc, type PendingSignIn } from './google-oidc.js';
import { SessionTokensService } from './session-tokens.service.js';

const STATE_TTL = 10 * 60;
const HANDOFF_TTL = 120;

const startSchema = z.object({ returnUrl: z.string().max(512).refine(isAllowedReturnUrl, 'URL de vuelta no permitida') }).strict();
const codeSchema = z.object({ code: z.string().regex(/^[\w-]{20,64}$/) }).strict();
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) }).strict();
const onboardingSchema = z.object({ adult: z.literal(true), termsAccepted: z.literal(true), displayName: z.string().trim().min(1).max(60).optional() }).strict();
const deleteSchema = z.object({ confirm: z.literal('ELIMINAR') }).strict();

interface SignInState extends PendingSignIn {
  returnUrl: string;
}
interface Handoff {
  userId: string;
  sessionId: string;
  refreshToken: string;
  isNew: boolean;
}

/**
 * Autenticación de producción (fase 13): «Continuar con Google». La API hace todo el flujo OAuth; la app recibe un
 * código de un solo uso (2 min) en la URL de vuelta y lo canjea por la sesión: los tokens nunca viajan en una URL.
 */
@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly google: GoogleOidc | null;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly tokens: SessionTokensService,
    private readonly devAuth: DevAuthService,
    private readonly connections: ConnectionsService,
  ) {
    const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
    this.google = clientId && clientSecret && tokens.enabled ? new GoogleOidc({ clientId, clientSecret, redirectUri: env.GOOGLE_SIGNIN_REDIRECT_URI }) : null;
  }

  private key(kind: 'state' | 'handoff', value: string) {
    return `${this.env.QUEUE_PREFIX}:auth-${kind}:${value}`;
  }

  @Public()
  @Get('v1/auth/providers')
  providers(): AuthProvidersDto {
    return { google: this.google !== null, dev: this.devAuth.enabled };
  }

  /** Abre el inicio de sesión de Google. La app navega aquí (página completa en la web; navegador de auth en móvil). */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('v1/auth/google/start')
  async start(@Query(new ZodPipe(startSchema)) query: z.infer<typeof startSchema>, @Res() res: Response): Promise<void> {
    if (!this.google) throw new ServiceUnavailableException('Inicio de sesión con Google no configurado');
    const state = randomBytes(24).toString('base64url');
    const { url, pending } = this.google.start(state);
    await this.redis.set(this.key('state', state), JSON.stringify({ ...pending, returnUrl: query.returnUrl } satisfies SignInState), 'EX', STATE_TTL);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, url);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('v1/auth/google/callback')
  async callback(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const state = typeof query.state === 'string' && /^[\w-]{20,64}$/.test(query.state) ? query.state : '';
    const raw = state ? await this.redis.getdel(this.key('state', state)) : null;
    if (!raw || !this.google) {
      res.status(400).type('text/plain').send('La solicitud de inicio de sesión ha caducado: vuelve a intentarlo desde la app.');
      return;
    }
    const pending = JSON.parse(raw) as SignInState;
    const back = (params: Record<string, string>) => {
      const url = new URL(pending.returnUrl);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      res.redirect(302, url.toString());
    };
    if (typeof query.error === 'string' || typeof query.code !== 'string') {
      back({ auth: 'error', message: query.error === 'access_denied' ? 'Se canceló el inicio de sesión' : 'Google no completó el inicio de sesión' });
      return;
    }
    try {
      const identity = await this.google.complete(query.code, pending);
      const { userId, isNew } = await findOrCreateUserForIdentity(this.database.db, { provider: 'google', ...identity });
      const session = await createSession(this.database.db, userId);
      const code = randomBytes(24).toString('base64url');
      const handoff: Handoff = { userId, sessionId: session.sessionId, refreshToken: session.refreshToken, isNew };
      await this.redis.set(this.key('handoff', code), JSON.stringify(handoff), 'EX', HANDOFF_TTL);
      back({ auth: 'ok', code });
    } catch (error) {
      this.logger.warn(`Inicio de sesión con Google rechazado: ${(error as Error).message.slice(0, 160)}`);
      back({ auth: 'error', message: 'No se pudo verificar la identidad de Google' });
    }
  }

  /** Canjea el código de un solo uso por la sesión. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('v1/auth/exchange')
  @HttpCode(200)
  async exchange(@Body(new ZodPipe(codeSchema)) body: z.infer<typeof codeSchema>): Promise<AuthSessionDto> {
    const raw = await this.redis.getdel(this.key('handoff', body.code));
    if (!raw) throw new UnauthorizedException('Código caducado o ya usado');
    const handoff = JSON.parse(raw) as Handoff;
    return this.sessionDto(handoff.userId, handoff.sessionId, handoff.refreshToken, handoff.isNew);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('v1/auth/refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>): Promise<AuthSessionDto> {
    if (!this.tokens.enabled) throw new ServiceUnavailableException('Autenticación de producción no configurada');
    try {
      const rotated = await rotateSession(this.database.db, body.refreshToken);
      return await this.sessionDto(rotated.userId, rotated.sessionId, rotated.refreshToken, false);
    } catch {
      throw new UnauthorizedException('Sesión no válida o caducada');
    }
  }

  @Post('v1/auth/logout')
  @HttpCode(204)
  async logout(@CurrentUser() auth: AuthContext): Promise<void> {
    if (auth.sessionId) await revokeSession(this.database.db, auth.sessionId, auth.userId);
  }

  /** Alta: mayoría de edad y condiciones (único momento de consentimiento, junto con las fuentes). */
  @Post('v1/me/onboarding')
  @HttpCode(204)
  async onboarding(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(onboardingSchema)) body: z.infer<typeof onboardingSchema>): Promise<void> {
    await completeOnboarding(this.database.db, auth.userId, { adult: body.adult, termsAccepted: body.termsAccepted, ...(body.displayName ? { displayName: body.displayName } : {}) });
  }

  /**
   * Eliminar la cuenta: desconecta cada fuente revocando el permiso en el proveedor y borrando lo importado, y después
   * borra al usuario (en cascada: perfil, ajustes, evidencia, afinidades, amistades, chats, sesiones, tokens push…).
   * Solo cuentas reales: las personas de la demo se gestionan con el seed.
   */
  @Delete('v1/me')
  @HttpCode(204)
  async deleteAccount(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(deleteSchema)) _body: z.infer<typeof deleteSchema>): Promise<void> {
    if (auth.dataset !== 'live') throw new UnauthorizedException('Las personas de la demo no se eliminan desde la app');
    for (const connection of await this.connections.list(auth.userId)) {
      if (connection.status === 'revoked') continue;
      await this.connections.disconnect(auth.userId, connection.id, true).catch((error: Error) => {
        this.logger.warn(`Al eliminar la cuenta no se pudo desconectar ${connection.sourceKey}: ${error.message.slice(0, 120)}`);
      });
    }
    await this.database.db.delete(users).where(eq(users.id, auth.userId));
  }

  private async sessionDto(userId: string, sessionId: string, refreshToken: string, isNew: boolean): Promise<AuthSessionDto> {
    const [user] = await this.database.db.select({ adult: users.adultConfirmedAt, terms: users.termsAcceptedAt }).from(users).where(eq(users.id, userId));
    const access = await this.tokens.issue(userId, sessionId);
    return { ...access, refreshToken, isNew, needsOnboarding: !user?.adult || !user.terms };
  }
}

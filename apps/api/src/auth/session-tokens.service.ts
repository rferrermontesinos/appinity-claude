import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { APP_ENV, type AppEnv } from '../config/env.js';

const ISSUER = 'appinity-claude';
const AUDIENCE = 'appinity-claude-api';
/** Access token corto: el cierre de sesión y la eliminación de cuenta se comprueban además en cada petición. */
export const ACCESS_TTL_SECONDS = 15 * 60;

/** Tokens de acceso de producción (HS256 con AUTH_SECRET). Distintos de los de desarrollo (otro emisor y `kind`). */
@Injectable()
export class SessionTokensService {
  private readonly key: Uint8Array | null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.key = env.AUTH_SECRET ? new TextEncoder().encode(env.AUTH_SECRET) : null;
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  async issue(userId: string, sessionId: string): Promise<{ accessToken: string; expiresAt: string }> {
    if (!this.key) throw new Error('AUTH_SECRET no configurado');
    const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000);
    const accessToken = await new SignJWT({ kind: 'user', sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { accessToken, expiresAt: expiresAt.toISOString() };
  }

  /** Null si no es un token de producción válido (p. ej., uno de desarrollo). */
  async verify(token: string): Promise<{ userId: string; sessionId: string } | null> {
    if (!this.key) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      if (payload.kind !== 'user' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}

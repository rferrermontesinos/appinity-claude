import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { APP_ENV, type AppEnv } from '../config/env.js';

const ISSUER = 'appinity-claude-dev';
const AUDIENCE = 'appinity-claude-api';
const TTL_SECONDS = 12 * 60 * 60;

/** Huella del código de una cuenta local real: al regenerar el código, las sesiones anteriores dejan de valer. */
export function localCodeFingerprint(hash: string): string {
  return createHash('sha256').update(hash).digest('base64url').slice(0, 16);
}

/**
 * Identidad de desarrollo: JWT HS256 firmado por la API solo con DEMO_MODE y DEV_AUTH_ENABLED.
 * No sustituye la autenticación de producción (Google, Apple, email), que no se simula.
 */
@Injectable()
export class DevAuthService {
  private readonly key: Uint8Array | null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.key = env.DEV_AUTH_ENABLED && env.DEV_AUTH_SECRET ? new TextEncoder().encode(env.DEV_AUTH_SECRET) : null;
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  async issue(userId: string, localCodeHash?: string | null): Promise<{ token: string; expiresAt: string }> {
    if (!this.key) throw new Error('Identidad de desarrollo desactivada');
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
    const token = await new SignJWT({ kind: 'dev', ...(localCodeHash ? { lc: localCodeFingerprint(localCodeHash) } : {}) })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async verify(token: string): Promise<{ userId: string; localCodeFingerprint?: string }> {
    if (!this.key) throw new Error('Identidad de desarrollo desactivada');
    const { payload } = await jwtVerify(token, this.key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (payload.kind !== 'dev' || typeof payload.sub !== 'string') throw new Error('Token no válido');
    return { userId: payload.sub, ...(typeof payload.lc === 'string' ? { localCodeFingerprint: payload.lc } : {}) };
  }
}

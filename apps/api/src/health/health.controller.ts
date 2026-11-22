import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { CheckResult, HealthDto } from '@appinity/shared';
import { sql } from 'drizzle-orm';
import type { DatabaseHandle } from '@appinity/database';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { Public } from '../common/public.decorator.js';
import { DATABASE, REDIS } from '../infra/tokens.js';
import { API_VERSION } from '../version.js';

/**
 * En producción, /health es público y solo dice si cada pieza responde: sin versiones (PostGIS), latencias, latido del
 * worker ni textos de error, que ayudan a un atacante y pueden llevar nombres internos (auditoría 2026-11-22, SEC-007).
 * Fuera de producción se mantiene el detalle para `pnpm doctor` y el diagnóstico de la app.
 */
export function publicCheck(check: CheckResult, production: boolean): CheckResult {
  return production ? { ok: check.ok } : check;
}

async function timed(fn: () => Promise<string | undefined>): Promise<CheckResult> {
  const started = performance.now();
  try {
    const detail = await fn();
    return { ok: true, latencyMs: Math.round(performance.now() - started), ...(detail ? { detail } : {}) };
  } catch (error) {
    return { ok: false, latencyMs: Math.round(performance.now() - started), detail: (error as Error).message };
  }
}

@Controller()
export class HealthController {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get('health')
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const [database, postgis, redis, worker] = await Promise.all([
      timed(async () => {
        await this.database.db.execute(sql`select 1`);
        return undefined;
      }),
      timed(async () => {
        const result = await this.database.db.execute<{ version: string }>(sql`select postgis_lib_version() as version`);
        return `PostGIS ${result.rows[0]?.version ?? '?'}`;
      }),
      timed(async () => {
        await this.redis.ping();
        return undefined;
      }),
      timed(async () => {
        const beat = await this.redis.get(`${this.env.QUEUE_PREFIX}:worker:heartbeat`);
        if (!beat) throw new Error('Sin latido del worker (¿está arrancado `pnpm worker`?)');
        const ageSeconds = Math.round((Date.now() - Number(beat)) / 1000);
        if (ageSeconds > 30) throw new Error(`Último latido hace ${ageSeconds} s`);
        return `Latido hace ${ageSeconds} s`;
      }),
    ]);
    // El worker es necesario para syncs, pero no para servir la API: no degrada el estado.
    const ok = database.ok && postgis.ok && redis.ok;
    const production = this.env.NODE_ENV === 'production';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      service: 'appinity-api',
      version: API_VERSION,
      time: new Date().toISOString(),
      mode: { environment: this.env.NODE_ENV, demoMode: this.env.DEMO_MODE, devAuth: this.env.DEV_AUTH_ENABLED },
      checks: {
        database: publicCheck(database, production),
        postgis: publicCheck(postgis, production),
        redis: publicCheck(redis, production),
        worker: publicCheck(worker, production),
      },
    };
  }
}

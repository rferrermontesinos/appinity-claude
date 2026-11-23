import { SourceError } from '@appinity/shared';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { failedJobReport } from '../src/failures.js';

const job = (attemptsMade: number, attempts = 3) => ({ name: 'sync', attemptsMade, opts: { attempts } });

describe('avisos de trabajos fallidos del worker', () => {
  it('los reintentos intermedios no se avisan; el último intento, sí', () => {
    const error = new TypeError('x is undefined');
    expect(failedJobReport('profile-sync', job(1), error)).toBeNull();
    expect(failedJobReport('profile-sync', job(2), error)).toBeNull();
    expect(failedJobReport('profile-sync', job(3), error)).toEqual({ level: 'error', tags: { queue: 'profile-sync', job: 'sync' } });
  });

  it('un trabajo sin reintentos se avisa al primer fallo', () => {
    expect(failedJobReport('affinity', { name: 'recompute-all', attemptsMade: 1, opts: {} }, new Error('x'))).not.toBeNull();
  });

  it('nunca avisa de un UnrecoverableError (perfil privado, clave no válida: lo resuelve la persona)', () => {
    expect(failedJobReport('profile-sync', job(1), new UnrecoverableError('El perfil de Steam es privado'))).toBeNull();
  });

  it('un proveedor caído tras todos los reintentos es un «warning» con su código', () => {
    const error = new SourceError('unavailable', 'La Steam Web API no está disponible (HTTP 503)', true);
    expect(failedJobReport('profile-sync', job(3), error)).toEqual({
      level: 'warning',
      tags: { queue: 'profile-sync', job: 'sync', source_error: 'unavailable' },
    });
  });

  it('un trabajo atascado (sin job) se avisa', () => {
    expect(failedJobReport('system', undefined, new Error('job stalled more than allowable limit'))).toEqual({
      level: 'error',
      tags: { queue: 'system', job: '(sin trabajo)' },
    });
  });
});

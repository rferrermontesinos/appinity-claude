import { CONTACT_HASH_DAILY_MAX } from '@appinity/shared';
import { RateLimitedError } from '@appinity/ingestion';
import type { Redis } from 'ioredis';

/**
 * Cupo diario de la búsqueda por contactos (auditoría 2026-11-22, SEC-004). Un SHA-256 de un email no anonimiza: quien
 * conoce el email puede calcularlo. El límite por minuto frenaba la ráfaga, pero dejaba comprobar unos 3,6 millones de
 * emails al día por cuenta; con el cupo, como mucho CONTACT_HASH_DAILY_MAX (dos agendas completas de la app al día).
 */
export function contactsQuotaKey(prefix: string, userId: string, now = new Date()): string {
  return `${prefix}:contacts-quota:${userId}:${now.toISOString().slice(0, 10)}`;
}

/** Reserva `count` comprobaciones del día (UTC). Si no caben, no reserva nada y lanza RateLimitedError (429). */
export async function reserveContactChecks(redis: Redis, prefix: string, userId: string, count: number, now = new Date()): Promise<void> {
  if (count <= 0) return;
  const key = contactsQuotaKey(prefix, userId, now);
  const total = await redis.incrby(key, count);
  if (total === count) await redis.expire(key, 48 * 3600);
  if (total > CONTACT_HASH_DAILY_MAX) {
    await redis.decrby(key, count);
    throw new RateLimitedError(`Has llegado al máximo de ${CONTACT_HASH_DAILY_MAX} contactos comprobados hoy. Vuelve a intentarlo mañana.`);
  }
}

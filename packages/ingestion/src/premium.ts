import { entitlements, revenuecatEvents, users, type Database } from '@appinity/database';
import { and, eq, inArray, isNull } from 'drizzle-orm';

/**
 * Premium (§16 y §17, fase 12B) con RevenueCat. Reglas de su documentación (consultada el 2026-10-15):
 * - Entrega «al menos una vez» y reintenta con el mismo `id`: se procesa cada evento una sola vez.
 * - `EXPIRATION` retira el acceso. `CANCELLATION` no (sigue hasta `expiration_at_ms`). `SUBSCRIPTION_PAUSED` tampoco.
 * - `environment` (`SANDBOX`/`PRODUCTION`) viene de la tienda: el entitlement se guarda por entorno.
 * - `TRANSFER`: el webhook llega para el destino; quien transfiere (`transferred_from`) pierde el acceso.
 * - `app_user_id` es el id de usuario de APPINITY (la app configura el SDK con él); se buscan también los alias.
 * Ningún evento toca gustos ni afinidades. La app nunca concede Premium por sí misma.
 */
export type PremiumEnvironment = 'sandbox' | 'production';

export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
  entitlement_ids?: string[] | null;
  product_id?: string | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  environment?: string | null;
}

export type EventOutcome = 'applied' | 'duplicate' | 'test' | 'ignored_entitlement' | 'ignored_stale' | 'unknown_user';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function existingUsers(db: Database, ids: Array<string | null | undefined>): Promise<string[]> {
  const candidates = [...new Set(ids.filter((v): v is string => typeof v === 'string' && UUID.test(v)))];
  if (!candidates.length) return [];
  const rows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, candidates), isNull(users.deletedAt)));
  return rows.map((r) => r.id);
}

export async function applyRevenueCatEvent(
  db: Database,
  event: RevenueCatEvent,
  options: { entitlementId: string; now?: Date },
): Promise<EventOutcome> {
  const now = options.now ?? new Date();
  const environment: PremiumEnvironment = event.environment === 'PRODUCTION' ? 'production' : 'sandbox';
  const eventAt = new Date(event.event_timestamp_ms ?? now.getTime());
  const transfer = event.type === 'TRANSFER';
  const targets = await existingUsers(db, transfer ? (event.transferred_to ?? []) : [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]);
  const losers = transfer ? await existingUsers(db, event.transferred_from ?? []) : [];

  let outcome: EventOutcome;
  if (event.type === 'TEST') outcome = 'test';
  else if (!transfer && !(event.entitlement_ids ?? []).includes(options.entitlementId)) outcome = 'ignored_entitlement';
  else if (!targets.length && !losers.length) outcome = 'unknown_user';
  else outcome = 'applied';

  return db.transaction(async (tx) => {
    // Idempotencia: el registro del evento es lo primero; un reintento choca con la clave primaria.
    const inserted = await tx
      .insert(revenuecatEvents)
      .values({
        eventId: event.id,
        type: event.type,
        environment,
        userId: targets[0] ?? losers[0] ?? null,
        productId: event.product_id ?? null,
        eventAt,
        receivedAt: now,
        outcome,
      })
      .onConflictDoNothing()
      .returning({ id: revenuecatEvents.eventId });
    if (!inserted.length) return 'duplicate';
    if (outcome !== 'applied') return outcome;

    let stale = false;
    for (const userId of losers) {
      await tx
        .update(entitlements)
        .set({ active: false, lastEventAt: eventAt, updatedAt: now })
        .where(and(eq(entitlements.userId, userId), eq(entitlements.entitlementId, options.entitlementId), eq(entitlements.environment, environment)));
    }
    const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
    const active = event.type !== 'EXPIRATION' && (expiresAt === null || expiresAt > now);
    for (const userId of targets) {
      const [current] = await tx
        .select()
        .from(entitlements)
        .where(and(eq(entitlements.userId, userId), eq(entitlements.entitlementId, options.entitlementId), eq(entitlements.environment, environment)));
      // Un evento anterior al último aplicado (reintento tardío) no deshace el estado más reciente.
      if (current && current.lastEventAt > eventAt) {
        stale = true;
        continue;
      }
      const values = { active, productId: event.product_id ?? current?.productId ?? null, expiresAt, lastEventAt: eventAt, updatedAt: now };
      if (current) {
        await tx
          .update(entitlements)
          .set(values)
          .where(and(eq(entitlements.userId, userId), eq(entitlements.entitlementId, options.entitlementId), eq(entitlements.environment, environment)));
      } else {
        await tx.insert(entitlements).values({ userId, entitlementId: options.entitlementId, environment, ...values });
      }
    }
    if (stale && !losers.length && targets.length === 1) {
      await tx.update(revenuecatEvents).set({ outcome: 'ignored_stale' }).where(eq(revenuecatEvents.eventId, event.id));
      return 'ignored_stale';
    }
    return 'applied';
  });
}

export interface PremiumStatus {
  premium: boolean;
  environment: PremiumEnvironment;
  productId: string | null;
  expiresAt: string | null;
}

/** Estado Premium verificado en servidor para el entorno de esta instalación. */
export async function premiumStatus(
  db: Database,
  userId: string,
  options: { entitlementId: string; environment: PremiumEnvironment; now?: Date },
): Promise<PremiumStatus> {
  const now = options.now ?? new Date();
  const [row] = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.entitlementId, options.entitlementId), eq(entitlements.environment, options.environment)));
  const premium = Boolean(row?.active && (row.expiresAt === null || row.expiresAt > now));
  return {
    premium,
    environment: options.environment,
    productId: premium ? (row?.productId ?? null) : null,
    expiresAt: premium ? (row?.expiresAt?.toISOString() ?? null) : null,
  };
}

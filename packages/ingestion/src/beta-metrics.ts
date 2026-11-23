import { type Database } from '@appinity/database';
import { sql } from 'drizzle-orm';
import { countUnreadFeedback } from './feedback.js';
import { countPendingReports } from './moderation.js';
import { recommendFor } from './recommendations.js';
import { topSoulmates } from './soulmates.js';
import { VOTE_SOURCE_KEY } from './votes.js';

/**
 * Métricas de la beta (fase B9), sin terceros: todo sale de nuestra base de datos y solo se dan recuentos, nunca
 * personas. Responden a los criterios de cada ola (docs/fases-beta.md y docs/diagnostico-2026-10-27.md):
 * - Ola 1: todas completan el alta y ven gustos importados en menos de 24 h.
 * - Ola 2: al menos el 50 % con un alma gemela en 48 h y un 30 % de tarjetas de Inicio de consenso o descubrimiento.
 * - Ola 3: retención a 7 días del 30 % y Trending activo en la ciudad principal.
 *
 * Las personas que cuentan son las del dataset, no eliminadas, dadas de alta desde `since`. Las medidas de uso cuentan
 * a las que completaron el alta y no están suspendidas.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Tarjetas que pide Inicio en cada tanda (apps/mobile/src/state/homeDeck.ts). */
export const HOME_BATCH = 10;

export interface BetaMetricsOptions {
  dataset?: 'live' | 'demo';
  /** Solo personas dadas de alta desde esta fecha (el inicio de una ola). */
  since?: Date;
  now?: Date;
}

export interface Ratio {
  count: number;
  of: number;
}

export interface BetaMetrics {
  dataset: 'live' | 'demo';
  since: string | null;
  generatedAt: string;
  people: { accounts: number; onboarded: number; suspended: number };
  wave1: { importedTastes: Ratio; importedWithin24h: Ratio; medianHoursToFirstImport: number | null; votedInApp: Ratio };
  wave2: {
    /** De quienes llevan al menos 48 h: cuántas tienen ya un alma gemela visible (ahora, no a las 48 h exactas). */
    soulmateAfter48h: Ratio;
    /** Primera tanda de Inicio de cada persona, calculada ahora: personales (consenso, descubrimiento y seguidas). */
    homeCards: { personal: number; trending: number; fallback: number; total: number };
    votesPerActiveDay: { last7: number | null; previous7: number | null };
  };
  wave3: {
    /** Volvieron entre el día 7 y el 13 tras el alta (aproximado: votos, tarjetas, mensajes, sesiones y comentarios). */
    retainedDay7: Ratio;
    withTrending: Ratio;
    withLocation: Ratio;
    pushReachedLast7: number;
  };
  pending: { reports: number; feedback: number };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const PERSONAL_BLOCKS = new Set(['consensus', 'discovery', 'followed']);

export async function betaMetrics(db: Database, options: BetaMetricsOptions = {}): Promise<BetaMetrics> {
  const dataset = options.dataset ?? 'live';
  const now = options.now ?? new Date();
  const since = options.since ?? new Date(0);

  const accounts = await db.execute<{ id: string; created_at: Date; onboarded: boolean; status: 'active' | 'suspended' | 'deleted' }>(sql`
    select u.id, u.created_at, (u.adult_confirmed_at is not null and u.terms_accepted_at is not null) as onboarded, u.status
    from users u
    where u.dataset = ${dataset} and u.deleted_at is null and u.status <> 'deleted'
      and u.created_at >= ${since} and u.created_at <= ${now}
  `);
  const people = accounts.rows.filter((r) => r.onboarded && r.status === 'active');
  const ids = people.map((p) => p.id);
  const createdAt = new Map(people.map((p) => [p.id, new Date(p.created_at)]));
  const idList = ids.length
    ? sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )
    : sql`null::uuid`;

  // Ola 1: primera evidencia de una fuente externa (los votos en la app no cuentan como importación).
  const imports = await db.execute<{ user_id: string; first_import: Date | null; voted: boolean }>(sql`
    select u.id as user_id,
      (select min(o.first_synced_at) from user_item_observations o where o.user_id = u.id and o.source_key <> ${VOTE_SOURCE_KEY}) as first_import,
      exists (select 1 from item_votes v where v.user_id = u.id) as voted
    from users u where u.id in (${idList})
  `);
  const hoursToImport = imports.rows
    .filter((r) => r.first_import)
    .map((r) => Math.max(0, (new Date(r.first_import!).getTime() - createdAt.get(r.user_id)!.getTime()) / HOUR));

  // Ola 2: almas gemelas (de quienes llevan 48 h) y la mezcla de Inicio, persona a persona, como la vería ahora.
  const after48h = ids.filter((id) => now.getTime() - createdAt.get(id)!.getTime() >= 2 * DAY);
  let withSoulmate = 0;
  for (const id of after48h) if ((await topSoulmates(db, id, 1)).length) withSoulmate++;
  const cards = { personal: 0, trending: 0, fallback: 0, total: 0 };
  let withTrending = 0;
  let withLocation = 0;
  for (const id of ids) {
    const result = await recommendFor(db, id, { limit: HOME_BATCH, now, applyHomeDismissals: true });
    for (const item of result.items) {
      cards.total++;
      if (PERSONAL_BLOCKS.has(item.block)) cards.personal++;
      else if (item.block === 'trending') cards.trending++;
      else cards.fallback++;
    }
    if (result.trending.status !== 'no_location') withLocation++;
    if (result.available.trending > 0) withTrending++;
  }

  const votesBetween = async (from: Date, to: Date) => {
    const [row] = (
      await db.execute<{ votes: number; days: number }>(sql`
        select count(*)::int as votes, count(distinct (v.user_id, (v.created_at at time zone 'UTC')::date))::int as days
        from item_votes v where v.user_id in (${idList}) and v.created_at >= ${from} and v.created_at < ${to}
      `)
    ).rows;
    return row && row.days ? Math.round((row.votes / row.days) * 10) / 10 : null;
  };

  // Ola 3: actividad entre el día 7 y el 13 tras el alta. No hay registro de aperturas de la app: se deduce de lo que
  // deja huella (votos, acciones y tarjetas de Inicio, mensajes enviados, sesiones y comentarios).
  const after7d = ids.filter((id) => now.getTime() - createdAt.get(id)!.getTime() >= 7 * DAY);
  const after7dList = after7d.length
    ? sql.join(
        after7d.map((id) => sql`${id}::uuid`),
        sql`, `,
      )
    : sql`null::uuid`;
  const retained = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from users u
    where u.id in (${after7dList}) and exists (
      select 1 from (
        select v.created_at as t from item_votes v where v.user_id = u.id
        union all select a.created_at from recommendation_actions a where a.user_id = u.id
        union all select i.first_shown_at from recommendation_impressions i where i.user_id = u.id
        union all select i.last_shown_at from recommendation_impressions i where i.user_id = u.id
        union all select m.created_at from messages m where m.sender_id = u.id
        union all select s.created_at from auth_sessions s where s.user_id = u.id
        union all select s.last_used_at from auth_sessions s where s.user_id = u.id
        union all select f.created_at from feedback f where f.user_id = u.id
      ) activity
      where activity.t >= u.created_at + interval '7 days' and activity.t < u.created_at + interval '14 days' and activity.t <= ${now}
    )
  `);
  const push = await db.execute<{ n: number }>(sql`
    select count(distinct d.user_id)::int as n from notification_deliveries d
    where d.user_id in (${idList}) and d.status = 'sent' and d.created_at >= ${new Date(now.getTime() - 7 * DAY)} and d.created_at <= ${now}
  `);

  return {
    dataset,
    since: options.since ? options.since.toISOString() : null,
    generatedAt: now.toISOString(),
    people: {
      accounts: accounts.rows.length,
      onboarded: people.length,
      suspended: accounts.rows.filter((r) => r.status === 'suspended').length,
    },
    wave1: {
      importedTastes: { count: hoursToImport.length, of: ids.length },
      importedWithin24h: { count: hoursToImport.filter((h) => h <= 24).length, of: ids.length },
      medianHoursToFirstImport: median(hoursToImport),
      votedInApp: { count: imports.rows.filter((r) => r.voted).length, of: ids.length },
    },
    wave2: {
      soulmateAfter48h: { count: withSoulmate, of: after48h.length },
      homeCards: cards,
      votesPerActiveDay: {
        last7: await votesBetween(new Date(now.getTime() - 7 * DAY), now),
        previous7: await votesBetween(new Date(now.getTime() - 14 * DAY), new Date(now.getTime() - 7 * DAY)),
      },
    },
    wave3: {
      retainedDay7: { count: retained.rows[0]?.n ?? 0, of: after7d.length },
      withTrending: { count: withTrending, of: ids.length },
      withLocation: { count: withLocation, of: ids.length },
      pushReachedLast7: push.rows[0]?.n ?? 0,
    },
    pending: { reports: await countPendingReports(db), feedback: await countUnreadFeedback(db) },
  };
}

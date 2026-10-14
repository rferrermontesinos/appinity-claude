import {
  DATED_CATEGORIES,
  RECOMMENDATION_PARAMS_V1,
  RECOMMENDATION_VERSION,
  consensusCandidates,
  currentYear,
  discoveryCandidates,
  mixRecommendations,
  trendingCandidates,
  type ConsensusCandidate,
  type DiscoveryCandidate,
  type Opinion,
  type RecommendationBlock,
  type RecommendationParams,
  type TrendingCandidate,
} from '@appinity/algorithms';
import { catalogItems, categoryAffinities, homeDismissals, userItemProfiles, userProfiles, userSettings, users, type Database } from '@appinity/database';
import { isCategory, type Category } from '@appinity/shared';
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { topSoulmates } from './soulmates.js';

/**
 * Recomendaciones para un usuario (§12 y §13), calculadas al pedirlas a partir de lo ya consolidado (perfiles y
 * afinidades). Nada de lo que hace el usuario en la app (descartar, conservar, deshacer) cambia sus gustos: solo
 * filtra lo que se muestra.
 *
 * Filtros comunes: objetos conocidos (knownConfidence ≥ 0,8), descartes de Home (si se piden para Home), objetos ya
 * mostrados en la sesión, lugares fuera del radio (o todos los lugares si no hay ubicación: no se presume ninguna) y
 * eventos terminados. Las categorías locales son restaurantes y cultura.
 */
const LOCAL_CATEGORIES: readonly Category[] = ['food', 'culture'];

export interface RecommendationOptions {
  limit?: number;
  now?: Date;
  /** Solo una categoría (Categories, fase 9). */
  category?: Category;
  /** Home aplica los descartes; Categories no (§3). */
  applyHomeDismissals?: boolean;
  /** Objetos ya mostrados en la sesión. */
  excludeItemIds?: readonly string[];
  params?: RecommendationParams;
}

export interface RecommendationItem {
  itemId: string;
  block: RecommendationBlock;
  fillsFor: RecommendationBlock | null;
  score: number;
  consensus?: { supporters: number; opinionated: number };
  discovery?: { contributorId: string; contributorName: string; contributorAffinity: number };
  trending?: { positiveVoters: number; totalVoters: number; averageScore: number };
}

export type TrendingStatus = 'ok' | 'no_location' | 'insufficient_votes';

export interface RecommendationResult {
  items: RecommendationItem[];
  /** Candidatos disponibles por bloque (antes de mezclar). */
  available: Record<RecommendationBlock, number>;
  trending: { status: TrendingStatus; year: number; radiusKm: number | null; minVoters: number };
  localFilter: 'radius' | 'no_location';
  algorithmVersion: string;
}

interface ItemMeta {
  id: string;
  category: Category;
  releaseYear: number | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  inRadius: boolean | null;
}

async function itemMeta(db: Database, itemIds: string[], viewerId: string, hasLocation: boolean, radiusM: number): Promise<Map<string, ItemMeta>> {
  if (!itemIds.length) return new Map();
  const out = new Map<string, ItemMeta>();
  for (let i = 0; i < itemIds.length; i += 500) {
    const rows = await db
      .select({
        id: catalogItems.id,
        category: catalogItems.category,
        releaseYear: sql<number | null>`extract(year from ${catalogItems.releaseDate})::int`,
        eventStartsAt: catalogItems.eventStartsAt,
        eventEndsAt: catalogItems.eventEndsAt,
        // Distancia en metros con PostGIS (geography), nunca en grados.
        inRadius: hasLocation
          ? sql<boolean | null>`case when ${catalogItems.location} is null then null else st_dwithin(${catalogItems.location}, (select location from user_settings where user_id = ${viewerId}), ${radiusM}) end`
          : sql<null>`null`,
      })
      .from(catalogItems)
      .where(inArray(catalogItems.id, itemIds.slice(i, i + 500)));
    for (const r of rows) {
      if (!isCategory(r.category)) continue;
      out.set(r.id, { ...r, category: r.category });
    }
  }
  return out;
}

export async function recommendFor(db: Database, userId: string, options: RecommendationOptions = {}): Promise<RecommendationResult> {
  const params = options.params ?? RECOMMENDATION_PARAMS_V1;
  const now = options.now ?? new Date();
  const limit = options.limit ?? 30;
  const [viewer] = await db
    .select({ dataset: users.dataset, timeZone: userSettings.timeZone, radiusKm: userSettings.radiusKm, latitude: userSettings.locationLatitude })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId));
  const timeZone = viewer?.timeZone ?? 'UTC';
  const year = currentYear(now, timeZone);
  const hasLocation = viewer?.latitude !== null && viewer?.latitude !== undefined;
  const radiusKm = viewer?.radiusKm ?? 10;
  const radiusM = radiusKm * 1000;

  // Exclusiones: conocidos, descartes de Home y lo ya mostrado en la sesión.
  const excluded = new Set(options.excludeItemIds ?? []);
  const known = await db
    .select({ itemId: userItemProfiles.catalogItemId })
    .from(userItemProfiles)
    .where(and(eq(userItemProfiles.userId, userId), gte(userItemProfiles.knownConfidence, params.knownThreshold)));
  for (const k of known) excluded.add(k.itemId);
  if (options.applyHomeDismissals !== false) {
    const dismissed = await db.select({ itemId: homeDismissals.catalogItemId }).from(homeDismissals).where(eq(homeDismissals.userId, userId));
    for (const d of dismissed) excluded.add(d.itemId);
  }

  // Almas gemelas: SOLO el Top 50 (la persona 51 no influye en el consenso ni en el descubrimiento).
  const soulmates = await topSoulmates(db, userId);
  const soulmateIds = soulmates.map((s) => s.userId);
  const prefs = soulmateIds.length
    ? await db
        .select({
          userId: userItemProfiles.userId,
          itemId: userItemProfiles.catalogItemId,
          score: userItemProfiles.preferenceScore,
          confidence: userItemProfiles.preferenceConfidence,
        })
        .from(userItemProfiles)
        .where(and(inArray(userItemProfiles.userId, soulmateIds), isNotNull(userItemProfiles.preferenceScore)))
    : [];

  // Votos de Trending: personas de la zona (sin mirar su afinidad), votos explícitos fechados este año.
  let votes: Array<{ userId: string; itemId: string; score: number; confidence: number }> = [];
  let trendingStatus: TrendingStatus = 'no_location';
  if (hasLocation && viewer) {
    const result = await db.execute<{ user_id: string; item_id: string; score: number; confidence: number }>(sql`
      select p.user_id, p.catalog_item_id as item_id, p.preference_score as score, p.preference_confidence as confidence
      from user_item_profiles p
      join users u on u.id = p.user_id
      join user_settings s on s.user_id = u.id
      where u.dataset = ${viewer.dataset} and u.status = 'active' and u.deleted_at is null and u.adult_confirmed_at is not null
        and u.id <> ${userId}
        and s.location is not null
        and st_dwithin(s.location, (select location from user_settings where user_id = ${userId}), ${radiusM})
        and not exists (select 1 from user_blocks b where (b.blocker_user_id = ${userId} and b.blocked_user_id = u.id) or (b.blocker_user_id = u.id and b.blocked_user_id = ${userId}))
        and p.preference_basis in ('explicit_rating', 'explicit_like')
        and p.preference_confidence >= ${params.trending.voteConfidence}
        -- La fecha del VOTO (occurred_at, nunca synced_at) debe caer en el año actual del destinatario.
        and exists (
          select 1 from user_item_observations o
          where o.user_id = p.user_id and o.catalog_item_id = p.catalog_item_id
            and o.preference_basis in ('explicit_rating', 'explicit_like')
            and o.occurred_at is not null
            and extract(year from (o.occurred_at at time zone (case when o.timestamp_precision = 'year' then 'UTC' else ${timeZone} end))) = ${year}
        )
    `);
    votes = result.rows.map((r) => ({ userId: r.user_id, itemId: r.item_id, score: Number(r.score), confidence: Number(r.confidence) }));
    trendingStatus = 'insufficient_votes';
  }

  const meta = await itemMeta(db, [...new Set([...prefs.map((p) => p.itemId), ...votes.map((v) => v.itemId)])], userId, hasLocation, radiusM);
  /** Objeto recomendable: no excluido, de la categoría pedida, local dentro del radio y evento no terminado. */
  const eligible = (itemId: string) => {
    const m = meta.get(itemId);
    if (!m || excluded.has(itemId)) return false;
    if (options.category && m.category !== options.category) return false;
    if (LOCAL_CATEGORIES.includes(m.category) && m.inRadius !== true) return false;
    const end = m.eventEndsAt ?? m.eventStartsAt;
    if (end && end < now) return false;
    return true;
  };
  /** Reglas de fecha de Trending (§13): obras con fecha, de este año; eventos, este año; lo permanente, sin regla. */
  const trendingEligible = (itemId: string) => {
    const m = meta.get(itemId)!;
    if (DATED_CATEGORIES.includes(m.category)) return m.releaseYear === year;
    if (m.eventStartsAt) return currentYear(m.eventStartsAt, timeZone) === year;
    return true;
  };

  // Consenso.
  const opinionsByItem = new Map<string, Opinion[]>();
  for (const p of prefs) {
    if (p.score === null || p.confidence === null || !eligible(p.itemId)) continue;
    opinionsByItem.set(p.itemId, [...(opinionsByItem.get(p.itemId) ?? []), { userId: p.userId, score: p.score, confidence: p.confidence }]);
  }
  const consensus = consensusCandidates(opinionsByItem, params);

  // Descubrimiento: con la afinidad global y la de cada categoría hacia cada persona.
  const catRows = soulmateIds.length
    ? await db
        .select({ target: categoryAffinities.targetUserId, category: categoryAffinities.category, score: categoryAffinities.score })
        .from(categoryAffinities)
        .where(and(eq(categoryAffinities.sourceUserId, userId), inArray(categoryAffinities.targetUserId, soulmateIds)))
    : [];
  const discovery = discoveryCandidates(
    soulmates.map((s) => ({
      userId: s.userId,
      affinity: s.score,
      categoryAffinity: Object.fromEntries(catRows.filter((c) => c.target === s.userId).map((c) => [c.category, c.score])),
      preferences: prefs
        .filter((p) => p.userId === s.userId && p.score !== null && p.confidence !== null && eligible(p.itemId))
        .map((p) => ({ itemId: p.itemId, category: meta.get(p.itemId)!.category, score: p.score!, confidence: p.confidence! })),
    })),
    params,
  );

  // Trending.
  const votesByItem = new Map<string, Opinion[]>();
  for (const v of votes) {
    if (!eligible(v.itemId) || !trendingEligible(v.itemId)) continue;
    votesByItem.set(v.itemId, [...(votesByItem.get(v.itemId) ?? []), { userId: v.userId, score: v.score, confidence: v.confidence }]);
  }
  const trending = trendingCandidates(votesByItem, params);
  if (trending.length) trendingStatus = 'ok';

  const names = new Map(
    soulmateIds.length
      ? (await db.select({ id: userProfiles.userId, name: userProfiles.displayName }).from(userProfiles).where(inArray(userProfiles.userId, soulmateIds))).map((r) => [r.id, r.name])
      : [],
  );
  const mixed = mixRecommendations({ consensus, discovery, trending }, limit, params);
  return {
    items: mixed.map(({ block, fillsFor, candidate }) => {
      const base = { itemId: candidate.itemId, block, fillsFor, score: (candidate as { score: number }).score };
      if (block === 'consensus') {
        const c = candidate as ConsensusCandidate;
        return { ...base, consensus: { supporters: c.supporters, opinionated: c.opinionated } };
      }
      if (block === 'discovery') {
        const d = candidate as DiscoveryCandidate;
        return { ...base, discovery: { contributorId: d.contributorId, contributorName: names.get(d.contributorId) ?? '—', contributorAffinity: d.contributorAffinity } };
      }
      const t = candidate as TrendingCandidate;
      return { ...base, trending: { positiveVoters: t.positiveVoters, totalVoters: t.totalVoters, averageScore: t.averageScore } };
    }),
    available: { consensus: consensus.length, discovery: discovery.length, trending: trending.length },
    trending: { status: trendingStatus, year, radiusKm: hasLocation ? radiusKm : null, minVoters: params.trending.minVoters },
    localFilter: hasLocation ? 'radius' : 'no_location',
    algorithmVersion: RECOMMENDATION_VERSION,
  };
}

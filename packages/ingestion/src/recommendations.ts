import {
  DATED_CATEGORIES,
  RECOMMENDATION_PARAMS_V1,
  RECOMMENDATION_VERSION,
  communityCandidates,
  contentCandidates,
  consensusCandidates,
  currentYear,
  exploreOrder,
  discoveryCandidates,
  followedCandidates,
  mixRecommendations,
  trendingCandidates,
  type ConsensusCandidate,
  type CommunityCandidate,
  type DiscoveryCandidate,
  type FollowedCandidate,
  type FallbackBlock,
  type Opinion,
  type RecommendationBlock,
  type RecommendationParams,
  type TrendingCandidate,
} from '@appinity/algorithms';
import {
  catalogItems,
  catalogRelations,
  categoryAffinities,
  homeDismissals,
  itemVotes,
  recommendationImpressions,
  recommendationActions,
  userAffinities,
  userItemProfiles,
  userProfiles,
  userSettings,
  users,
  type Database,
} from '@appinity/database';
import { isCategory, type Category, type RecommendationEvidenceDto } from '@appinity/shared';
import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { itemTitles } from './content.js';
import { unseenItems } from './home.js';
import { CONSENSUS_SOULMATES, topSoulmates } from './soulmates.js';
import { activeFollowedIds } from './follows.js';

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

/** Días tras los que una obra pasada («Paso») vuelve a Inicio para valorarla. */
export const PASS_RETURN_DAYS = 30;

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
  /**
   * Respaldos cuando se agotan los bloques principales (comunidad, conservados, explorar). Por defecto, sí: el mazo no
   * se agota mientras haya algo honesto que enseñar (decisión del usuario, 2026-10-14).
   */
  includeFallbacks?: boolean;
}

export interface RecommendationItem {
  itemId: string;
  block: RecommendationBlock | FallbackBlock;
  fillsFor: RecommendationBlock | null;
  score: number;
  /** NEW: nunca se había mostrado a este usuario (no significa estreno). */
  isNew: boolean;
  consensus?: { supporters: number; opinionated: number };
  discovery?: { contributorId: string; contributorName: string; contributorAffinity: number; contributorFollowed: boolean };
  followed?: { contributorId: string; contributorName: string; contributorAffinity: number | null };
  /** Motivo combinado: personas que sigues a las que también les encanta (no cambia el orden). */
  followedBy?: { names: string[]; count: number };
  trending?: { positiveVoters: number; totalVoters: number; averageScore: number };
  community?: { supporters: number };
  content?: { becauseItemId: string; becauseTitle: string; relation: string };
  /** Desglose numérico del motivo (agregado; ver RecommendationEvidenceDto). */
  evidence?: RecommendationEvidenceDto;
}

const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);

export type TrendingStatus = 'ok' | 'no_location' | 'insufficient_votes';

export interface RecommendationResult {
  items: RecommendationItem[];
  /** Candidatos disponibles por bloque (antes de mezclar). */
  available: Record<RecommendationBlock | FallbackBlock, number>;
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
  // Votadas (2026-10-27): un voto es definitivo, también «No lo conozco»; no vuelven en ningún sitio.
  const voted = await db.select({ itemId: itemVotes.catalogItemId }).from(itemVotes).where(eq(itemVotes.userId, userId));
  for (const v of voted) excluded.add(v.itemId);
  // Guardadas (doble toque): no vuelven a Inicio; en Recomendaciones van primero, en su propio apartado.
  const keptRows = await db
    .selectDistinct({ itemId: recommendationActions.catalogItemId })
    .from(recommendationActions)
    .where(and(eq(recommendationActions.userId, userId), eq(recommendationActions.action, 'keep'), isNull(recommendationActions.undoneAt)));
  const keptIds = new Set(keptRows.map((k) => k.itemId).filter((id) => !excluded.has(id)));
  const sessionSeen = new Set(options.excludeItemIds ?? []);
  // Inicio: lo que pasaste vuelve para valorarlo a los PASS_RETURN_DAYS del último paso (decisión del titular,
  // 2026-10-27: «lo descartado vuelve cada mes»).
  const returnAfter = new Date(now.getTime() - PASS_RETURN_DAYS * 86_400_000);
  if (options.applyHomeDismissals !== false) {
    const dismissed = await db
      .select({ itemId: homeDismissals.catalogItemId })
      .from(homeDismissals)
      .where(and(eq(homeDismissals.userId, userId), gte(homeDismissals.createdAt, returnAfter)));
    for (const d of dismissed) excluded.add(d.itemId);
    for (const id of keptIds) excluded.add(id);
  } else {
    // Recomendaciones: solo lo guardado y lo que NUNCA ha salido en Inicio (ni votado, ni pasado, ni visto). Lo pasado
    // no vuelve aquí: vuelve a Inicio para valorarlo.
    const shown = await db.select({ itemId: recommendationImpressions.catalogItemId }).from(recommendationImpressions).where(eq(recommendationImpressions.userId, userId));
    const passed = await db.select({ itemId: homeDismissals.catalogItemId }).from(homeDismissals).where(eq(homeDismissals.userId, userId));
    for (const p of passed) excluded.add(p.itemId);
    for (const r of shown) excluded.add(r.itemId);
    for (const id of keptIds) excluded.add(id);
  }

  // Almas gemelas: SOLO el Top 50 (la persona 51 no influye en el consenso ni en el descubrimiento).
  // Siempre el Top 50, también con Premium (§16).
  const soulmates = await topSoulmates(db, userId, CONSENSUS_SOULMATES);
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

  // Seguidos (creadores y amigos): sus gustos fuertes forman su propio bloque y enriquecen el motivo de las demás
  // tarjetas. Nunca votan en el consenso del Top 50.
  const followedIds = await activeFollowedIds(db, userId);
  const followedPrefs = followedIds.length
    ? await db
        .select({ userId: userItemProfiles.userId, itemId: userItemProfiles.catalogItemId, score: userItemProfiles.preferenceScore, confidence: userItemProfiles.preferenceConfidence })
        .from(userItemProfiles)
        .where(and(inArray(userItemProfiles.userId, followedIds), isNotNull(userItemProfiles.preferenceScore)))
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

  const meta = await itemMeta(db, [...new Set([...prefs.map((p) => p.itemId), ...followedPrefs.map((p) => p.itemId), ...votes.map((v) => v.itemId)])], userId, hasLocation, radiusM);
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

  const followed = followedCandidates(
    followedIds.map((id) => ({
      userId: id,
      preferences: followedPrefs
        .filter((p) => p.userId === id && p.score !== null && p.confidence !== null && eligible(p.itemId))
        .map((p) => ({ itemId: p.itemId, score: p.score!, confidence: p.confidence! })),
    })),
    params,
  );
  /** Seguidos a los que les encanta un objeto (mismos umbrales que un apoyo del consenso). */
  const followedLikers = new Map<string, string[]>();
  for (const p of followedPrefs) {
    if (p.score === null || p.confidence === null) continue;
    if (p.score < params.consensus.positiveScore || p.confidence < params.consensus.positiveConfidence) continue;
    followedLikers.set(p.itemId, [...(followedLikers.get(p.itemId) ?? []), p.userId]);
  }

  // Trending.
  const votesByItem = new Map<string, Opinion[]>();
  for (const v of votes) {
    if (!eligible(v.itemId) || !trendingEligible(v.itemId)) continue;
    votesByItem.set(v.itemId, [...(votesByItem.get(v.itemId) ?? []), { userId: v.userId, score: v.score, confidence: v.confidence }]);
  }
  const trending = trendingCandidates(votesByItem, params);
  if (trending.length) trendingStatus = 'ok';

  const names = new Map(
    soulmateIds.length || followedIds.length
      ? (await db.select({ id: userProfiles.userId, name: userProfiles.displayName }).from(userProfiles).where(inArray(userProfiles.userId, [...new Set([...soulmateIds, ...followedIds])]))).map((r) => [r.id, r.name])
      : [],
  );
  const savedFirst: RecommendationItem[] = [];
  if (options.applyHomeDismissals === false && keptIds.size) {
    const keptMeta = await itemMeta(db, [...keptIds].filter((id) => !sessionSeen.has(id)), userId, hasLocation, radiusM);
    for (const [id, m] of keptMeta) {
      if (options.category && m.category !== options.category) continue;
      if (LOCAL_CATEGORIES.includes(m.category) && m.inRadius !== true) continue;
      const end = m.eventEndsAt ?? m.eventStartsAt;
      if (end && end < now) continue;
      savedFirst.push({ itemId: id, block: 'kept', fillsFor: null, score: 0, isNew: false });
    }
  }
  const mixed = mixRecommendations({ consensus, discovery, followed, trending }, Math.max(0, limit - savedFirst.length), params);
  const followedAffinity = new Map(
    followedIds.length
      ? (await db.select({ target: userAffinities.targetUserId, score: userAffinities.score }).from(userAffinities).where(and(eq(userAffinities.sourceUserId, userId), inArray(userAffinities.targetUserId, followedIds)))).map((a) => [a.target, a.score])
      : [],
  );
  /** Motivo combinado para una tarjeta (sin quien ya es el autor de la tarjeta). */
  const combined = (itemId: string, except?: string) => {
    const likers = (followedLikers.get(itemId) ?? []).filter((id) => id !== except);
    return likers.length ? { followedBy: { names: likers.slice(0, 2).map((id) => names.get(id) ?? '—'), count: likers.length } } : {};
  };
  const soulmateBy = new Map(soulmates.map((s) => [s.userId, s]));
  const mainItems: RecommendationItem[] = mixed.map(({ block, fillsFor, candidate }) => {
    const base = { itemId: candidate.itemId, block, fillsFor, score: (candidate as { score: number }).score, isNew: false };
    if (block === 'consensus') {
      const c = candidate as ConsensusCandidate;
      // Quiénes lo apoyan (mismos umbrales que el consenso): solo se exponen agregados, nunca sus nombres.
      const backers = (opinionsByItem.get(c.itemId) ?? [])
        .filter((o) => o.score >= params.consensus.positiveScore && o.confidence >= params.consensus.positiveConfidence)
        .map((o) => soulmateBy.get(o.userId))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      const evidence: RecommendationEvidenceDto = {
        score: pct(c.score),
        support: pct(c.supporters / c.opinionated),
        likeLevel: pct(c.averagePositive),
        confidence: pct(c.evidenceConfidence),
        ...(backers.length ? { supporterAffinity: Math.round(backers.reduce((a, s) => a + s.score, 0) / backers.length) } : {}),
        exceptionalSupporters: backers.filter((s) => s.exceptionalMutual).length,
      };
      return { ...base, consensus: { supporters: c.supporters, opinionated: c.opinionated }, evidence, ...combined(c.itemId) };
    }
    if (block === 'discovery') {
      const d = candidate as DiscoveryCandidate;
      const pref = prefs.find((p) => p.userId === d.contributorId && p.itemId === d.itemId);
      const evidence: RecommendationEvidenceDto = {
        score: pct(d.score),
        ...(pref?.score != null ? { likeLevel: pct(pref.score) } : {}),
        ...(pref?.confidence != null ? { confidence: pct(pref.confidence) } : {}),
        supporterAffinity: Math.round(d.contributorAffinity),
        exceptionalSupporters: soulmateBy.get(d.contributorId)?.exceptionalMutual ? 1 : 0,
      };
      // Si el alma gemela que lo descubre es alguien a quien sigues, se dice en el propio motivo (no se repite su nombre).
      return {
        ...base,
        discovery: { contributorId: d.contributorId, contributorName: names.get(d.contributorId) ?? '—', contributorAffinity: d.contributorAffinity, contributorFollowed: followedIds.includes(d.contributorId) },
        evidence,
        ...combined(d.itemId, d.contributorId),
      };
    }
    if (block === 'followed') {
      const f = candidate as FollowedCandidate;
      const pref = followedPrefs.find((p) => p.userId === f.contributorId && p.itemId === f.itemId);
      const affinity = followedAffinity.get(f.contributorId) ?? null;
      const evidence: RecommendationEvidenceDto = {
        score: pct(f.score),
        ...(pref?.score != null ? { likeLevel: pct(pref.score) } : {}),
        ...(pref?.confidence != null ? { confidence: pct(pref.confidence) } : {}),
        ...(affinity !== null ? { supporterAffinity: Math.round(affinity) } : {}),
      };
      return { ...base, followed: { contributorId: f.contributorId, contributorName: names.get(f.contributorId) ?? '—', contributorAffinity: affinity }, evidence, ...combined(f.itemId, f.contributorId) };
    }
    const t = candidate as TrendingCandidate;
    const evidence: RecommendationEvidenceDto = {
      score: pct((t.score + 1) / 2),
      support: pct(t.positiveVoters / t.totalVoters),
      areaRating: pct((t.averageScore + 1) / 2),
      radiusKm: Math.round(radiusM / 1000),
      year,
    };
    return { ...base, trending: { positiveVoters: t.positiveVoters, totalVoters: t.totalVoters, averageScore: t.averageScore }, evidence };
  });

  const items: RecommendationItem[] = [...savedFirst, ...mainItems];

  // Respaldos, en este orden y solo si los bloques principales no llenan la página.
  const available = { consensus: consensus.length, discovery: discovery.length, followed: followed.length, trending: trending.length, content: 0, community: 0, kept: 0, explore: 0 };
  if (options.includeFallbacks !== false && items.length < limit && viewer) {
    const used = new Set(items.map((i) => i.itemId));
    const take = (itemId: string) => !used.has(itemId) && items.length < limit && (used.add(itemId), true);

    // Por contenido (arranque en frío): obras relacionadas con lo que a esta persona le gusta (Wikidata, CC0).
    const likes = await db
      .select({ itemId: userItemProfiles.catalogItemId, score: userItemProfiles.preferenceScore, confidence: userItemProfiles.preferenceConfidence })
      .from(userItemProfiles)
      .where(and(eq(userItemProfiles.userId, userId), gte(userItemProfiles.preferenceScore, 0.3)));
    if (likes.length) {
      const relations = await db
        .select({ sourceItemId: catalogRelations.sourceItemId, targetItemId: catalogRelations.targetItemId, relation: catalogRelations.relation, weight: catalogRelations.weight })
        .from(catalogRelations)
        .where(inArray(catalogRelations.sourceItemId, likes.map((l) => l.itemId)));
      const targets = [...new Set(relations.map((r) => r.targetItemId))].filter((id) => !meta.has(id));
      for (const [id, m] of await itemMeta(db, targets, userId, hasLocation, radiusM)) meta.set(id, m);
      const list = contentCandidates(
        likes.map((l) => ({ itemId: l.itemId, score: l.score ?? 0, confidence: l.confidence ?? 0 })),
        relations,
      ).filter((c) => eligible(c.itemId));
      available.content = list.length;
      const titles = await itemTitles(db, [...new Set(list.map((c) => c.becauseItemId))]);
      for (const c of list) {
        if (take(c.itemId)) {
          items.push({
            itemId: c.itemId,
            block: 'content',
            fillsFor: null,
            score: c.score,
            isNew: false,
            content: { becauseItemId: c.becauseItemId, becauseTitle: titles.get(c.becauseItemId) ?? '—', relation: c.relation },
            evidence: { score: pct(c.score), relatedLikes: c.sources },
          });
        }
      }
    }

    // Comunidad: cualquier persona elegible del dataset (sin afinidad ni zona), una persona = un voto.
    const community = await db.execute<{ user_id: string; item_id: string; score: number; confidence: number }>(sql`
      select p.user_id, p.catalog_item_id as item_id, p.preference_score as score, p.preference_confidence as confidence
      from user_item_profiles p
      join users u on u.id = p.user_id
      where u.dataset = ${viewer.dataset} and u.status = 'active' and u.deleted_at is null and u.adult_confirmed_at is not null
        and u.id <> ${userId} and p.preference_score is not null
        and not exists (select 1 from user_blocks b where (b.blocker_user_id = ${userId} and b.blocked_user_id = u.id) or (b.blocker_user_id = u.id and b.blocked_user_id = ${userId}))
    `);
    const communityRows = community.rows.map((r) => ({ userId: r.user_id, itemId: r.item_id, score: Number(r.score), confidence: Number(r.confidence) }));
    for (const [id, m] of await itemMeta(db, [...new Set(communityRows.map((r) => r.itemId))].filter((id) => !meta.has(id)), userId, hasLocation, radiusM)) meta.set(id, m);
    const byItem = new Map<string, Opinion[]>();
    for (const r of communityRows) {
      if (!eligible(r.itemId)) continue;
      byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), { userId: r.userId, score: r.score, confidence: r.confidence }]);
    }
    const communityList: CommunityCandidate[] = communityCandidates(byItem, params);
    available.community = communityList.length;
    for (const c of communityList) {
      if (take(c.itemId)) items.push({ itemId: c.itemId, block: 'community', fillsFor: null, score: c.score, isNew: false, community: { supporters: c.supporters }, evidence: { score: pct((c.score + 1) / 2), support: pct(c.supporters / c.opinionated) } });
    }

    available.kept = savedFirst.length;

    // Explorar: objetos del catálogo sin señales (obras, no ediciones ni temporadas), en orden estable por día.
    if (items.length < limit) {
      const catalog = await db
        .select({ id: catalogItems.id })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.dataset, viewer.dataset),
            isNull(catalogItems.parentItemId),
            ...(options.category ? [eq(catalogItems.category, options.category)] : []),
          ),
        )
        .limit(2_000);
      for (const [id, m] of await itemMeta(db, catalog.map((r) => r.id).filter((id) => !meta.has(id)), userId, hasLocation, radiusM)) meta.set(id, m);
      const seed = `${userId}:${now.toISOString().slice(0, 10)}`;
      // «Sin señales» es literal: si alguien de APPINITY ya lo valoró (también mal), no sale como «para explorar».
      const rated = new Set(communityRows.map((r) => r.itemId));
      const explore = exploreOrder(catalog.map((r) => r.id).filter((id) => eligible(id) && !rated.has(id)), seed);
      available.explore = explore.length;
      for (const itemId of explore) if (take(itemId)) items.push({ itemId, block: 'explore', fillsFor: null, score: 0, isNew: false });
    }
  }

  const unseen = await unseenItems(db, userId, items.map((i) => i.itemId));
  return {
    items: items.map((i) => ({ ...i, isNew: unseen.has(i.itemId) })),
    available,
    trending: { status: trendingStatus, year, radiusKm: hasLocation ? radiusKm : null, minVoters: params.trending.minVoters },
    localFilter: hasLocation ? 'radius' : 'no_location',
    algorithmVersion: RECOMMENDATION_VERSION,
  };
}

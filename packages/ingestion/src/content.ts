import type { EntityResolver } from '@appinity/catalog';
import { catalogExternalIds, catalogItems, catalogRelationChecks, catalogRelations, type Database } from '@appinity/database';
import type { Category, Dataset, IdentifiedEntity } from '@appinity/shared';
import { sql } from 'drizzle-orm';

/**
 * Relaciones por contenido (arranque en frío, 2026-10-22). Para cada objeto que a alguien le GUSTA y tiene QID, se
 * consultan sus relacionados en Wikidata (misma saga, director, autor, estudio, influencias…), se crean en el catálogo
 * si no existen y se guarda la relación. Son datos públicos (CC0), no de ningún usuario: no se guarda quién lo pidió.
 * Cada objeto se vuelve a consultar como mucho una vez cada `recheckDays` (o si cambia la versión).
 */
export const CONTENT_RELATIONS_VERSION = 'wikidata-relations-v1';
const RELATED_CATEGORIES: Category[] = ['movies', 'series', 'books', 'games', 'music'];

export interface RelatedWorksProvider {
  relatedWorks(qid: string, category: Category): Promise<Array<{ entity: IdentifiedEntity; relation: string; weight: number }>>;
}

export interface ContentRelationsResult {
  sources: number;
  relations: number;
  itemsCreated: number;
  failed: number;
}

export async function buildContentRelations(
  db: Database,
  resolver: EntityResolver,
  provider: RelatedWorksProvider,
  options: { dataset?: Dataset; maxSources?: number; minPreference?: number; recheckDays?: number; log?: (m: string) => void } = {},
): Promise<ContentRelationsResult> {
  const dataset = options.dataset ?? 'live';
  const sources = await db.execute<{ item_id: string; category: Category; qid: string }>(sql`
    select c.id as item_id, c.category, e.external_id as qid
    from catalog_items c
    join ${catalogExternalIds} e on e.catalog_item_id = c.id and e.provider = 'wikidata' and e.id_type = 'entity'
    join user_item_profiles p on p.catalog_item_id = c.id
    join users u on u.id = p.user_id and u.dataset = ${dataset} and u.status = 'active' and u.deleted_at is null
    left join ${catalogRelationChecks} k on k.catalog_item_id = c.id
    where c.dataset = ${dataset}
      and c.category in (${sql.join(RELATED_CATEGORIES.map((x) => sql`${x}`), sql`, `)})
      and p.preference_score >= ${options.minPreference ?? 0.3}
      and (k.catalog_item_id is null or k.version <> ${CONTENT_RELATIONS_VERSION}
           or k.checked_at < now() - make_interval(days => ${options.recheckDays ?? 30}))
    group by c.id, c.category, e.external_id
    order by max(p.preference_score * coalesce(p.preference_confidence, 0)) desc
    limit ${options.maxSources ?? 40}
  `);
  const result: ContentRelationsResult = { sources: 0, relations: 0, itemsCreated: 0, failed: 0 };
  for (const s of sources.rows) {
    let works: Awaited<ReturnType<RelatedWorksProvider['relatedWorks']>>;
    try {
      works = await provider.relatedWorks(s.qid, s.category);
    } catch (error) {
      result.failed++;
      options.log?.(`relaciones de ${s.qid}: ${(error as Error).message.slice(0, 120)}`);
      continue;
    }
    let found = 0;
    for (const w of works) {
      const resolved = await resolver.resolve(
        {
          category: w.entity.category,
          itemType: w.entity.itemType,
          title: w.entity.title,
          sourceKey: 'wikidata',
          sourceId: w.entity.canonicalIds['wikidata:entity'] ?? w.entity.title,
          canonicalIds: w.entity.canonicalIds,
          ...(w.entity.releaseYear ? { attributes: { releaseYear: w.entity.releaseYear } } : {}),
        },
        dataset,
      );
      result.itemsCreated += resolved.itemsCreated;
      if (resolved.targetItemId === s.item_id) continue;
      const inserted = await db
        .insert(catalogRelations)
        .values({ sourceItemId: s.item_id, targetItemId: resolved.targetItemId, relation: w.relation, weight: w.weight, version: CONTENT_RELATIONS_VERSION })
        .onConflictDoNothing()
        .returning({ target: catalogRelations.targetItemId });
      found += inserted.length;
    }
    await db
      .insert(catalogRelationChecks)
      .values({ catalogItemId: s.item_id, version: CONTENT_RELATIONS_VERSION, relationsFound: found })
      .onConflictDoUpdate({ target: catalogRelationChecks.catalogItemId, set: { version: CONTENT_RELATIONS_VERSION, relationsFound: found, checkedAt: new Date() } });
    result.sources++;
    result.relations += found;
  }
  return result;
}

/** Títulos de los gustos de origen, para el motivo «porque te gusta X». */
export async function itemTitles(db: Database, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.execute<{ id: string; title: string }>(sql`select id, title from ${catalogItems} where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.rows.map((r) => [r.id, r.title]));
}

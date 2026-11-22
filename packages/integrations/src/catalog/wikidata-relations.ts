import type { Category, IdentifiedEntity } from '@appinity/shared';

/** Relaciones entre obras y su peso (propuesta sin calibrar: una saga pesa más que compartir géneros). */
export type RelationKind =
  | 'same_series'
  | 'sequel'
  | 'same_director'
  | 'same_writer'
  | 'same_creator'
  | 'same_author'
  | 'same_developer'
  | 'influence'
  | 'shared_genres';

export const RELATION_WEIGHTS: Record<RelationKind, number> = {
  same_series: 1,
  sequel: 1,
  same_director: 0.8,
  same_writer: 0.6,
  same_creator: 0.8,
  same_author: 0.8,
  same_developer: 0.6,
  influence: 0.7,
  shared_genres: 0.4,
};

export interface RelatedWork {
  entity: IdentifiedEntity;
  relation: RelationKind;
  weight: number;
}

export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
/** Notoriedad mínima (número de Wikipedias) para recomendar algo relacionado. */
export const MIN_SITELINKS = 8;
/** Tipos de artista musical aceptados al buscar artistas con géneros en común. */
const ARTIST_TYPES = ['wd:Q5', 'wd:Q215380', 'wd:Q5741069', 'wd:Q2088357', 'wd:Q9212979'];

export interface RelatedQuery {
  relation: RelationKind;
  query: string;
}

/** Una consulta por relación: Wikidata no optimiza bien una UNION de todas (65 s frente a < 1,5 s cada una). */
function single(src: string, pattern: string, relation: RelationKind): RelatedQuery {
  return {
    relation,
    query:
      `SELECT ?item (MAX(?sl) AS ?links) WHERE { ${pattern.replaceAll('SRC', src)} FILTER(?item != ${src}) ` +
      `?item wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SITELINKS}) } GROUP BY ?item ORDER BY DESC(?links) LIMIT 25`,
  };
}

/**
 * Consultas SPARQL de relacionados por categoría:
 * - cine y series: misma saga, secuela o precuela, mismo director, guionista o creador;
 * - libros: mismo autor, misma saga, secuela;
 * - juegos: misma saga, mismo estudio, secuela;
 * - música: influencias (en ambos sentidos) y artistas del mismo tipo (grupo o solista) con al menos 2 géneros en común.
 * Comida, cultura y podcasts no tienen relaciones útiles en Wikidata: lista vacía.
 */
export function relatedQueries(qid: string, category: Category): RelatedQuery[] {
  if (!/^Q\d+$/.test(qid)) return [];
  const src = `wd:${qid}`;
  const series = 'SRC wdt:P179 ?x . ?item wdt:P179 ?x .';
  const sequel = 'SRC wdt:P155|wdt:P156 ?item .';
  switch (category) {
    case 'movies':
      return [
        single(src, series, 'same_series'),
        single(src, sequel, 'sequel'),
        single(src, 'SRC wdt:P57 ?x . ?item wdt:P57 ?x .', 'same_director'),
        single(src, 'SRC wdt:P58 ?x . ?item wdt:P58 ?x .', 'same_writer'),
      ];
    // En las series, P57 son los directores de episodios (decenas): demasiado amplio. Se usa el creador.
    case 'series':
      return [single(src, series, 'same_series'), single(src, sequel, 'sequel'), single(src, 'SRC wdt:P170 ?x . ?item wdt:P170 ?x .', 'same_creator')];
    case 'books':
      return [single(src, series, 'same_series'), single(src, sequel, 'sequel'), single(src, 'SRC wdt:P50 ?x . ?item wdt:P50 ?x .', 'same_author')];
    case 'games':
      return [single(src, series, 'same_series'), single(src, sequel, 'sequel'), single(src, 'SRC wdt:P178 ?x . ?item wdt:P178 ?x .', 'same_developer')];
    case 'music':
      return [
        single(src, '{ SRC wdt:P737 ?item . } UNION { ?item wdt:P737 SRC . }', 'influence'),
        {
          relation: 'shared_genres',
          query:
            `SELECT ?item (COUNT(DISTINCT ?g) AS ?shared) (MAX(?sl) AS ?links) WHERE { ${src} wdt:P136 ?g . ?item wdt:P136 ?g . ` +
            `${src} wdt:P31 ?t . ?item wdt:P31 ?t . FILTER(?t IN (${ARTIST_TYPES.join(', ')})) FILTER(?item != ${src}) ` +
            `?item wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SITELINKS * 2}) } ` +
            `GROUP BY ?item HAVING(COUNT(DISTINCT ?g) >= 2) ORDER BY DESC(?shared) DESC(?links) LIMIT 25`,
        },
      ];
    default:
      return [];
  }
}

/** Peso de una fila SPARQL: compartir más géneros pesa algo más (hasta 0,6), nunca como una saga. */
export function relationWeight(relation: RelationKind, sharedGenres = 0): number {
  return relation === 'shared_genres' ? Math.min(0.6, 0.4 + 0.1 * Math.max(0, sharedGenres - 2)) : RELATION_WEIGHTS[relation];
}

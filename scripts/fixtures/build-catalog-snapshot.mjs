#!/usr/bin/env node
// Construye packages/catalog/data/wikidata-snapshot.json a partir de catalog-selection.json.
//
// Fuente de metadatos: Wikidata (CC0). Fuente de imágenes: Wikimedia Commons; solo se
// aceptan archivos con licencia libre reconocida y se guarda autor, licencia y página
// de descripción para la atribución. El resultado se versiona en Git para que el seed
// sea determinista y no necesite red. Volver a ejecutar este script es una tarea manual
// de mantenimiento: `pnpm fixtures:catalog`.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER_AGENT =
  'appinity-claude-fixture-builder/0.1 (https://github.com/rferrermontesinos/appinity-claude)';
const SELECTION_PATH = fileURLToPath(new URL('./catalog-selection.json', import.meta.url));
const OUTPUT_PATH = fileURLToPath(
  new URL('../../packages/catalog/data/wikidata-snapshot.json', import.meta.url),
);
const THUMB_WIDTH = 960; // tamaño estándar de miniatura de Wikimedia
const LANGS = ['es', 'en', 'ca', 'mul'];

const ID_PROPERTIES = {
  common: [
    ['P646', 'freebase', 'mid'],
  ],
  movies: [
    ['P345', 'imdb', 'title'],
    ['P4947', 'tmdb', 'movie'],
  ],
  series: [
    ['P345', 'imdb', 'title'],
    ['P4983', 'tmdb', 'tv'],
  ],
  music: [
    ['P434', 'musicbrainz', 'artist'],
    ['P1902', 'spotify', 'artist'],
    ['P2850', 'apple_music', 'artist'],
    ['P1953', 'discogs', 'artist'],
  ],
  games: [
    ['P1733', 'steam', 'app'],
    ['P5794', 'igdb', 'game'],
  ],
  books: [
    ['P648', 'openlibrary', 'work'],
    ['P8383', 'goodreads', 'work'],
  ],
  food: [['P1968', 'foursquare', 'venue']],
  culture: [['P1968', 'foursquare', 'venue']],
  podcasts: [
    ['P5842', 'apple_podcasts', 'podcast'],
    ['P5916', 'spotify', 'show'],
  ],
};

const LINK_BUILDERS = {
  'imdb:title': (v) => `https://www.imdb.com/title/${v}/`,
  'tmdb:movie': (v) => `https://www.themoviedb.org/movie/${v}`,
  'tmdb:tv': (v) => `https://www.themoviedb.org/tv/${v}`,
  'musicbrainz:artist': (v) => `https://musicbrainz.org/artist/${v}`,
  'steam:app': (v) => `https://store.steampowered.com/app/${v}/`,
  'openlibrary:work': (v) => `https://openlibrary.org/works/${v}`,
  'apple_podcasts:podcast': (v) => `https://podcasts.apple.com/podcast/id${v}`,
};

// Licencias libres aceptadas. GPL aparece en capturas de juegos de software libre.
const ACCEPTED_LICENSE = /^(public domain|pd\b|pd-|cc0|cc[ -]by|cc-by|attribution|gfdl|l?gpl|no restrictions)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, init = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers ?? {}) },
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  }
  throw new Error(`Demasiados reintentos: ${url}`);
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function getEntities(ids) {
  const entities = {};
  for (const batch of chunk([...new Set(ids)], 40)) {
    const url =
      'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json' +
      `&ids=${batch.join('|')}&props=labels|descriptions|claims|sitelinks/urls` +
      `&languages=${LANGS.join('|')}&sitefilter=eswiki|enwiki|cawiki`;
    const data = await fetchJson(url);
    Object.assign(entities, data.entities);
    await sleep(300);
  }
  return entities;
}

async function sparql(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { headers: { Accept: 'application/sparql-results+json' } });
  return data.results.bindings;
}

function statements(entity, property) {
  const list = (entity?.claims?.[property] ?? []).filter((s) => s.rank !== 'deprecated');
  const preferred = list.filter((s) => s.rank === 'preferred');
  return (preferred.length ? preferred : list).filter((s) => s.mainsnak?.datavalue);
}

function values(entity, property) {
  return statements(entity, property).map((s) => s.mainsnak.datavalue.value);
}

function label(entity, lang) {
  return entity?.labels?.[lang]?.value;
}

function bestLabel(entity) {
  return label(entity, 'es') ?? label(entity, 'en') ?? label(entity, 'ca') ?? label(entity, 'mul');
}

// Fechas de Wikidata: precisión 9 = año, 10 = mes, 11 = día. Se conserva la precisión real.
function parseTime(value) {
  const match = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(value.time);
  if (!match || match[1] === '-') return null;
  const precision = value.precision >= 11 ? 'day' : value.precision === 10 ? 'month' : value.precision === 9 ? 'year' : null;
  if (!precision) return null;
  const year = match[2].padStart(4, '0').slice(-4);
  const month = precision === 'year' ? '01' : match[3];
  const day = precision === 'day' ? match[4] : '01';
  return { date: `${year}-${month}-${day}`, precision };
}

function earliestTime(entity, properties) {
  const parsed = properties
    .flatMap((p) => values(entity, p))
    .map(parseTime)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  return parsed[0] ?? null;
}

function stripHtml(html) {
  if (!html) return undefined;
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text || undefined;
}

async function getCommonsImages(fileNames) {
  const result = {};
  for (const batch of chunk([...new Set(fileNames)], 20)) {
    const titles = batch.map((f) => `File:${f}`).join('|');
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
      `&iiprop=url|size|mime|extmetadata&iiurlwidth=${THUMB_WIDTH}` +
      '&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|Restrictions|Copyrighted' +
      `&titles=${encodeURIComponent(titles)}`;
    const data = await fetchJson(url);
    const normalized = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of Object.values(data.query.pages)) {
      const info = page.imageinfo?.[0];
      const requested = (normalized.get(page.title) ?? page.title).replace(/^File:/, '');
      if (!info) {
        result[requested] = { rejected: 'missing' };
        continue;
      }
      const meta = info.extmetadata ?? {};
      const license = meta.LicenseShortName?.value ?? '';
      if (!ACCEPTED_LICENSE.test(license)) {
        result[requested] = { rejected: `license:${license || 'unknown'}` };
        continue;
      }
      result[requested] = {
        source: 'wikimedia_commons',
        sourceImageId: page.title,
        url: info.thumburl ?? info.url,
        originalUrl: info.url,
        width: info.thumbwidth ?? info.width,
        height: info.thumbheight ?? info.height,
        mime: info.mime,
        license,
        licenseUrl: meta.LicenseUrl?.value,
        artist: stripHtml(meta.Artist?.value),
        attributionRequired: meta.AttributionRequired?.value === 'true',
        restrictions: meta.Restrictions?.value || undefined,
        descriptionUrl: info.descriptionurl,
      };
    }
    await sleep(300);
  }
  return result;
}

function externalIds(entity, category) {
  const ids = [{ provider: 'wikidata', idType: 'entity', value: entity.id }];
  for (const [property, provider, idType] of [...ID_PROPERTIES.common, ...(ID_PROPERTIES[category] ?? [])]) {
    const value = values(entity, property)[0];
    if (typeof value !== 'string') continue;
    if (provider === 'openlibrary' && !value.endsWith('W')) continue;
    ids.push({ provider, idType, value });
  }
  return ids;
}

function links(entity, ids) {
  const out = [{ provider: 'wikidata', url: `https://www.wikidata.org/wiki/${entity.id}` }];
  const wiki = entity.sitelinks?.eswiki ?? entity.sitelinks?.enwiki ?? entity.sitelinks?.cawiki;
  if (wiki?.url) out.push({ provider: 'wikipedia', url: wiki.url });
  for (const id of ids) {
    const build = LINK_BUILDERS[`${id.provider}:${id.idType}`];
    if (build) out.push({ provider: id.provider, url: build(id.value) });
  }
  const website = values(entity, 'P856')[0];
  if (typeof website === 'string' && website.startsWith('https://')) out.push({ provider: 'website', url: website });
  return out;
}

async function main() {
  const selection = JSON.parse(await readFile(SELECTION_PATH, 'utf8'));
  const entries = selection.items;
  const entities = await getEntities(entries.map((e) => e.qid));

  // Entidades referenciadas (autores, géneros, sedes, países) para metadatos legibles.
  const refProps = ['P57', 'P50', 'P178', 'P136', 'P495', 'P276', 'P17'];
  const referenced = new Set();
  for (const entry of entries) {
    const entity = entities[entry.qid];
    for (const p of refProps) for (const v of values(entity, p)) if (v?.id) referenced.add(v.id);
  }
  const refEntities = await getEntities([...referenced]);

  const items = [];
  const imageWanted = new Map();

  for (const entry of entries) {
    const entity = entities[entry.qid];
    if (!entity || entity.missing !== undefined) throw new Error(`Entidad inexistente: ${entry.qid}`);
    const defaults = selection.defaults[entry.category];
    const ids = externalIds(entity, entry.category);
    const refLabels = (p, max = 3) =>
      values(entity, p)
        .map((v) => bestLabel(refEntities[v?.id]))
        .filter(Boolean)
        .slice(0, max);

    const item = {
      key: entry.key,
      category: entry.category,
      itemType: entry.itemType ?? defaults.itemType,
      title: bestLabel(entity) ?? entry.key,
      titles: Object.fromEntries(LANGS.map((l) => [l, label(entity, l)]).filter(([, v]) => v)),
      description: entity.descriptions?.es?.value ?? entity.descriptions?.en?.value ?? entity.descriptions?.ca?.value,
      externalIds: ids,
      links: links(entity, ids),
      metadata: {},
    };

    const creators = [...refLabels('P57'), ...refLabels('P50'), ...refLabels('P178')];
    if (creators.length) item.metadata.creators = creators;
    const genres = refLabels('P136');
    if (genres.length) item.metadata.genres = genres;
    const countries = values(entity, 'P495')
      .map((v) => values(refEntities[v?.id], 'P297')[0])
      .filter(Boolean);
    if (countries.length) item.metadata.countriesOfOrigin = countries;

    if (['movies', 'series', 'games', 'books'].includes(entry.category)) {
      const release = earliestTime(entity, entry.category === 'series' ? ['P580', 'P577'] : ['P577']);
      if (release) {
        item.releaseDate = release.date;
        item.releaseDatePrecision = release.precision;
      }
    }

    if (item.itemType === 'event') {
      const start = earliestTime(entity, ['P580', 'P585']);
      const end = earliestTime(entity, ['P582']);
      if (start) item.eventStartsAt = { date: start.date, precision: start.precision };
      if (end) item.eventEndsAt = { date: end.date, precision: end.precision };
    }

    if (entry.category === 'food' || entry.category === 'culture') {
      let coord = values(entity, 'P625')[0];
      if (!coord) {
        const venue = values(entity, 'P276')[0];
        if (venue?.id) {
          const venueEntity = (await getEntities([venue.id]))[venue.id];
          coord = values(venueEntity, 'P625')[0];
          item.metadata.venue = bestLabel(venueEntity);
        }
      }
      if (!coord) throw new Error(`Sin coordenadas: ${entry.key}`);
      const country = values(entity, 'P17').map((v) => values(refEntities[v?.id], 'P297')[0])[0];
      item.location = {
        latitude: Number(coord.latitude.toFixed(6)),
        longitude: Number(coord.longitude.toFixed(6)),
        locality: entry.locality,
        countryCode: country ?? 'ES',
      };
    }

    if (entry.image === null) {
      item.image = null;
      item.imageNote = entry.imageNote;
    } else {
      for (const property of defaults.imageProperties) {
        const file = values(entity, property)[0];
        if (typeof file === 'string') {
          imageWanted.set(entry.key, { file, property });
          break;
        }
      }
      if (!imageWanted.has(entry.key)) {
        item.image = null;
        item.imageNote = 'Wikidata no enlaza ninguna imagen libre para este objeto';
      }
    }
    items.push(item);
  }

  const commons = await getCommonsImages([...imageWanted.values()].map((w) => w.file));
  for (const item of items) {
    const wanted = imageWanted.get(item.key);
    if (!wanted) continue;
    const info = commons[wanted.file];
    if (!info || info.rejected) {
      item.image = null;
      item.imageNote = `Imagen descartada (${info?.rejected ?? 'sin datos'})`;
      continue;
    }
    item.image = { ...info, wikidataProperty: wanted.property };
  }

  // Ediciones (ISBN identifica una edición, no la obra).
  const editionWorks = entries.filter((e) => e.editions).map((e) => e.qid);
  if (editionWorks.length) {
    const rows = await sparql(`
      SELECT ?work ?ed ?edLabel ?isbn ?langCode ?pub WHERE {
        VALUES ?work { ${editionWorks.map((q) => `wd:${q}`).join(' ')} }
        ?ed wdt:P629 ?work; wdt:P212 ?isbn.
        OPTIONAL { ?ed wdt:P407 ?lang. ?lang wdt:P218 ?langCode }
        OPTIONAL { ?ed wdt:P577 ?pub }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en,ca". }
      }`);
    const byWork = new Map();
    for (const row of rows) {
      const work = row.work.value.split('/').pop();
      const list = byWork.get(work) ?? [];
      list.push({
        qid: row.ed.value.split('/').pop(),
        title: row.edLabel?.value,
        isbn: row.isbn.value.replace(/[^0-9X]/gi, ''),
        lang: row.langCode?.value,
        pub: row.pub?.value?.slice(0, 10),
      });
      byWork.set(work, list);
    }
    for (const entry of entries.filter((e) => e.editions)) {
      const candidates = (byWork.get(entry.qid) ?? [])
        .filter((c) => c.isbn.length === 13 && c.title && !/^Q\d+$/.test(c.title))
        .sort((a, b) => a.isbn.localeCompare(b.isbn));
      const chosen = [];
      for (const lang of ['es', 'en', 'ca']) {
        const c = candidates.find((x) => x.lang === lang && !chosen.some((y) => y.isbn === x.isbn));
        if (c) chosen.push(c);
      }
      for (const c of chosen.slice(0, 2)) {
        items.push({
          key: `${entry.key}/edition-${c.isbn}`,
          category: 'books',
          itemType: 'book_edition',
          parentKey: entry.key,
          title: c.title,
          titles: {},
          externalIds: [
            { provider: 'wikidata', idType: 'entity', value: c.qid },
            { provider: 'isbn', idType: 'isbn13', value: c.isbn },
          ],
          links: [{ provider: 'wikidata', url: `https://www.wikidata.org/wiki/${c.qid}` }],
          metadata: { language: c.lang },
          ...(c.pub ? { releaseDate: c.pub, releaseDatePrecision: 'day' } : {}),
          image: null,
          imageNote: 'Las ediciones no se muestran en el carrusel; se usa la imagen de la obra o el fallback',
        });
      }
    }
  }

  // Temporadas de series (pueden necesitar su propia fecha de estreno para Trending).
  const seasonSeries = entries.filter((e) => e.seasons);
  if (seasonSeries.length) {
    const rows = await sparql(`
      SELECT ?series ?season ?seasonLabel ?num ?pub WHERE {
        VALUES ?series { ${seasonSeries.map((e) => `wd:${e.qid}`).join(' ')} }
        ?season p:P179 ?st. ?st ps:P179 ?series. ?season wdt:P31 wd:Q3464665.
        OPTIONAL { ?st pq:P1545 ?num }
        OPTIONAL { ?season wdt:P577 ?pub }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
      }`);
    const seen = new Set();
    for (const row of rows.sort((a, b) => Number(a.num?.value ?? 0) - Number(b.num?.value ?? 0))) {
      const seriesQid = row.series.value.split('/').pop();
      const entry = seasonSeries.find((e) => e.qid === seriesQid);
      const qid = row.season.value.split('/').pop();
      if (!row.num?.value || seen.has(qid)) continue;
      seen.add(qid);
      const pub = row.pub?.value?.slice(0, 10);
      items.push({
        key: `${entry.key}/season-${row.num.value}`,
        category: 'series',
        itemType: 'season',
        parentKey: entry.key,
        title: row.seasonLabel?.value ?? `${entry.key} T${row.num.value}`,
        titles: {},
        externalIds: [{ provider: 'wikidata', idType: 'entity', value: qid }],
        links: [{ provider: 'wikidata', url: `https://www.wikidata.org/wiki/${qid}` }],
        metadata: { seasonNumber: Number(row.num.value) },
        ...(pub ? { releaseDate: pub, releaseDatePrecision: 'day' } : {}),
        image: null,
        imageNote: 'Temporada sin imagen propia; se muestra la de la serie o el fallback',
      });
    }
  }

  // Fechas de ediciones y temporadas con su precisión real (la consulta SPARQL no la incluye).
  const children = items.filter((i) => i.parentKey);
  const childEntities = await getEntities(children.map((i) => i.externalIds.find((e) => e.provider === 'wikidata').value));
  for (const child of children) {
    const qid = child.externalIds.find((e) => e.provider === 'wikidata').value;
    const release = earliestTime(childEntities[qid], ['P577']);
    delete child.releaseDate;
    delete child.releaseDatePrecision;
    if (release) {
      child.releaseDate = release.date;
      child.releaseDatePrecision = release.precision;
    }
  }

  // Deduplicar temporadas por clave (varias fechas de emisión) y ordenar de forma estable.
  const unique = new Map();
  for (const item of items) if (!unique.has(item.key)) unique.set(item.key, item);
  const sorted = [...unique.values()].sort((a, b) => a.key.localeCompare(b.key));

  const snapshot = {
    snapshotVersion: 1,
    source: 'wikidata+wikimedia_commons',
    retrievedAt: new Date().toISOString(),
    notes:
      'Objetos e imágenes reales. Metadatos de Wikidata (CC0). Imágenes de Wikimedia Commons con la licencia y autoría indicadas en cada entrada. La actividad de usuarios de la demo es simulada y vive en otros archivos.',
    items: sorted,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const withImage = sorted.filter((i) => i.image).length;
  console.log(`Escritos ${sorted.length} objetos (${withImage} con imagen) en ${OUTPUT_PATH}`);
  for (const item of sorted.filter((i) => !i.image && !i.parentKey)) {
    console.log(`  sin imagen: ${item.key} — ${item.imageNote}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

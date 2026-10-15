import { normalizeTitle } from '@appinity/shared';
import type { ExportRecord, Venue } from './schemas.js';

/**
 * Fase 11: Google Play (biblioteca), pedidos y reservas de comida y colecciones guardadas. Esquemas oficiales
 * (developers.google.com/data-portability/schema-reference, consultados el 2026-10-14):
 * - `play.library`: JSON con `doc` (título y tipo de documento) y `acquisitionTime`. El esquema no detalla `doc`: se
 *   aceptan `title` y `documentType`/`docType`, y el ID de paquete si aparece. El resumen del export registra los tipos
 *   vistos para contrastarlo con el primer export real.
 * - `order_reserve.purchases_reservations`: JSON. Pedidos (`transactionMerchant.name`, `creationTime`, `orderStatus`)
 *   y reservas (`merchantName`, `address`, `startTime`, `canceled`).
 * - `saved.collections`: un CSV por colección (`Title`, `Note`, `URL`, `Tags`, `Comment`), opcionalmente precedido por
 *   la descripción de la colección y una línea en blanco. Solo se usan los elementos que son lugares de Maps.
 *
 * Minimización: nunca se guardan notas, comentarios, importes, platos ni datos de pago; solo el comercio o lugar, su
 * dirección (para identificarlo) y el número de pedidos, reservas o listas.
 */
export interface Notes {
  skip(reason: string): void;
  key(key: string): void;
  enumValue(field: string, value: unknown): void;
  url(url: string): void;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
export const PACKAGE_NAME = /^[A-Za-z]\w*(\.\w+)+$/;

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  const wanted = keys.map(norm);
  for (const [k, v] of Object.entries(obj)) if (wanted.includes(norm(k))) return v;
  return undefined;
}

function objectsWith(root: unknown, anyOf: string[]): Array<Record<string, unknown>> {
  const wanted = anyOf.map(norm);
  const out: Array<Record<string, unknown>> = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) for (const n of node) walk(n);
    else if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (Object.keys(obj).some((k) => wanted.includes(norm(k)))) out.push(obj);
      else for (const v of Object.values(obj)) walk(v);
    }
  };
  walk(root);
  return out;
}

/** Primera cadena bajo alguna de las claves, buscando en profundidad (las direcciones van anidadas en los pedidos). */
function deepString(node: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 6 || !node || typeof node !== 'object') return undefined;
  const wanted = keys.map(norm);
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (wanted.includes(norm(k))) {
      const text = str(v);
      if (text) return text;
    }
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    const found = deepString(v, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Fecha ISO a partir de texto ISO, milisegundos o `{ seconds }` (formato JSON de los Timestamp de Google). */
export function isoTime(value: unknown): string | undefined {
  if (value && typeof value === 'object') {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
    return isoTime(pick(value as Record<string, unknown>, 'time', 'timestamp', 'usec'));
  }
  if (typeof value === 'number') return value > 1e12 ? new Date(value).toISOString() : value > 1e9 ? new Date(value * 1000).toISOString() : undefined;
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

type PlayKind = Extract<ExportRecord, { group: 'play.library' }>['docType'];

/** Tipo de documento de Play → tipo de APPINITY. Música y lo desconocido no se usan (el artista sale de YouTube). */
export function playDocType(value: string | undefined): PlayKind | null {
  const text = (value ?? '').toLowerCase();
  if (/audiobook|audiolibro|book|libro|ebook/.test(text)) return 'book';
  if (/\bapp|android|game|juego|aplicaci/.test(text)) return 'app';
  if (/movie|film|pel[ií]cula/.test(text)) return 'movie';
  if (/\btv\b|show|series|serie|episod|season|temporada/.test(text)) return 'series';
  return null;
}

export function extractPlayLibrary(files: unknown[], notes: Notes): ExportRecord[] {
  const byKey = new Map<string, Extract<ExportRecord, { group: 'play.library' }>>();
  for (const file of files) {
    for (const obj of objectsWith(file, ['doc'])) {
      Object.keys(obj).forEach((k) => notes.key(k));
      const doc = pick(obj, 'doc') as Record<string, unknown> | undefined;
      if (!doc || typeof doc !== 'object') {
        notes.skip('sin_documento');
        continue;
      }
      Object.keys(doc).forEach((k) => notes.key(`doc.${k}`));
      const rawType = str(pick(doc, 'documentType', 'docType', 'type'));
      notes.enumValue('doc.documentType', rawType);
      const docType = playDocType(rawType);
      const title = str(pick(doc, 'title', 'name'));
      if (!docType) {
        notes.skip('tipo_no_usado');
        continue;
      }
      if (!title) {
        notes.skip('sin_titulo');
        continue;
      }
      const id = str(pick(doc, 'docid', 'backendDocid', 'packageName', 'id'));
      const packageName = docType === 'app' && id && PACKAGE_NAME.test(id) ? id : undefined;
      const date = isoTime(pick(obj, 'acquisitionTime'));
      const key = `${docType}:${packageName ?? normalizeTitle(title)}`;
      const previous = byKey.get(key);
      // Un mismo objeto descargado varias veces: se conserva la primera adquisición.
      if (previous && (previous.date ?? '') <= (date ?? '')) continue;
      byKey.set(key, { group: 'play.library', title, docType, ...(packageName ? { packageName } : {}), ...(date ? { date } : {}) });
    }
  }
  return [...byKey.values()];
}

const venueKey = (v: Venue) => `${normalizeTitle(v.name)}|${normalizeTitle(v.address ?? '')}`;

export function extractOrders(files: unknown[], notes: Notes, now: Date): ExportRecord[] {
  type OrderRecord = Extract<ExportRecord, { group: 'order_reserve.purchases_reservations' }>;
  // Por nombre; la dirección solo separa cuando ambas la tienen y no coinciden (cadenas con varios locales). Así un
  // pedido sin dirección y una reserva con dirección del mismo restaurante cuentan juntos.
  const byName = new Map<string, OrderRecord[]>();
  const add = (venue: Venue, kind: 'orders' | 'reservations', date: string | undefined) => {
    const name = normalizeTitle(venue.name);
    const address = normalizeTitle(venue.address ?? '');
    const entries = byName.get(name) ?? [];
    let current = entries.find((e) => !address || !e.venue.address || normalizeTitle(e.venue.address) === address);
    if (!current) {
      current = { group: 'order_reserve.purchases_reservations', venue, orders: 0, reservations: 0 };
      entries.push(current);
      byName.set(name, entries);
    }
    current[kind]++;
    if (date && (!current.date || date > current.date)) current.date = date;
    if (!current.venue.address && venue.address) current.venue = venue;
  };
  for (const file of files) {
    for (const obj of objectsWith(file, ['merchantOrderId', 'transactionMerchant', 'merchantName', 'uniqueId'])) {
      Object.keys(obj).forEach((k) => notes.key(k));
      const isReservation = pick(obj, 'merchantName', 'uniqueId', 'partySize') !== undefined && pick(obj, 'transactionMerchant') === undefined;
      if (isReservation) {
        const canceled = String(pick(obj, 'canceled') ?? '').toLowerCase() === 'true';
        const start = isoTime(pick(obj, 'startTime'));
        const name = str(pick(obj, 'merchantName')) ?? str(pick(obj, 'name'));
        if (canceled) {
          notes.skip('reserva_cancelada');
          continue;
        }
        // Una reserva futura todavía no prueba la visita.
        if (start && Date.parse(start) > now.getTime()) {
          notes.skip('reserva_futura');
          continue;
        }
        if (!name) {
          notes.skip('sin_comercio');
          continue;
        }
        const address = str(pick(obj, 'address'));
        add({ name, ...(address ? { address } : {}) }, 'reservations', start ?? isoTime(pick(obj, 'createdTime')));
        continue;
      }
      const merchant = pick(obj, 'transactionMerchant') as Record<string, unknown> | undefined;
      const name = merchant && typeof merchant === 'object' ? str(pick(merchant, 'name')) : undefined;
      const status = JSON.stringify(pick(obj, 'orderStatus') ?? '');
      notes.enumValue('orderStatus', status.slice(0, 40));
      if (/cancel|reject|refund/i.test(status)) {
        notes.skip('pedido_cancelado');
        continue;
      }
      if (!name) {
        notes.skip('sin_comercio');
        continue;
      }
      const address = deepString(merchant, ['address', 'formattedAddress']) ?? deepString(pick(obj, 'lineItem'), ['address', 'formattedAddress']);
      add({ name, ...(address ? { address } : {}) }, 'orders', isoTime(pick(obj, 'creationTime')));
    }
  }
  return [...byName.values()].flat();
}

/** Es un enlace de Google Maps (lugar, búsqueda o enlace corto). */
export const isMapsUrl = (url: string) => /(^https?:\/\/)?([\w-]+\.)*google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url);

/** Nombre y, si las hay, coordenadas (`@lat,lng` o `search/lat,lng`) de un enlace de Maps. */
export function mapsUrlInfo(url: string): { name?: string; latitude?: number; longitude?: number } {
  const place = /\/maps\/place\/([^/@?]+)/.exec(url)?.[1];
  let name: string | undefined;
  if (place) {
    try {
      name = decodeURIComponent(place.replace(/\+/g, ' ')).trim() || undefined;
    } catch {
      name = undefined;
    }
  }
  const coords = /[@/](-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/.exec(url);
  const latitude = coords ? Number(coords[1]) : NaN;
  const longitude = coords ? Number(coords[2]) : NaN;
  const valid = Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return { ...(name ? { name } : {}), ...(coords && valid ? { latitude, longitude } : {}) };
}

/** Quita la descripción opcional de la colección (primera línea y línea en blanco) antes de la cabecera. */
export function savedCsvBody(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.findIndex((l) => /^\s*"?title"?\s*,/i.test(l));
  return header > 0 ? lines.slice(header).join('\n') : text;
}

export function extractSaved(csvFiles: Array<Array<Record<string, string>>>, notes: Notes): ExportRecord[] {
  const byPlace = new Map<string, Extract<ExportRecord, { group: 'saved.collections' }>>();
  for (const rows of csvFiles) {
    const seenInList = new Set<string>();
    for (const row of rows) {
      Object.keys(row).forEach((k) => notes.key(k));
      const url = str(pick(row, 'URL', 'Url', 'link'));
      if (!url || !isMapsUrl(url)) {
        notes.skip('no_es_lugar');
        continue;
      }
      notes.url(url);
      const info = mapsUrlInfo(url);
      const name = str(pick(row, 'Title', 'Título', 'Titulo')) ?? info.name;
      if (!name) {
        notes.skip('sin_nombre');
        continue;
      }
      const venue: Venue = {
        name,
        ...(info.latitude !== undefined && info.longitude !== undefined ? { latitude: info.latitude, longitude: info.longitude } : {}),
      };
      const key = url.replace(/[?#].*$/, '') || venueKey(venue);
      const current = byPlace.get(key) ?? { group: 'saved.collections' as const, venue, lists: 0, mapsUrl: url };
      if (!seenInList.has(key)) current.lists++;
      seenInList.add(key);
      byPlace.set(key, current);
    }
  }
  return [...byPlace.values()];
}

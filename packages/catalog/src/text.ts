/**
 * Normaliza un título para comparar atributos: sin acentos, minúsculas, sin puntuación ni espacios repetidos.
 * Sirve para encontrar coincidencias exactas tras la normalización; nunca para fusionar títulos «parecidos».
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Año de una fecha ISO parcial (YYYY, YYYY-MM o YYYY-MM-DD). */
export function yearOf(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const year = Number(isoDate.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

/** Distancia aproximada en metros (haversine). Solo para desempates locales; los filtros usan PostGIS. */
export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

import type { CatalogItemDto } from '@appinity/shared';

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : []);

/**
 * Línea de contexto bajo el título de una tarjeta: qué es la obra, en pocas palabras.
 * - Obras: «autor o director · año · género» con lo que haya.
 * - Lugares: la localidad.
 * - Si no hay nada de eso, la descripción corta de Wikidata.
 */
export function contextLine(item: CatalogItemDto): string | null {
  const description = item.description ? item.description.charAt(0).toUpperCase() + item.description.slice(1) : null;
  if (item.category === 'food' || item.category === 'culture') return item.location?.locality ?? description;
  const creators = strings(item.metadata.creators).slice(0, 2);
  const genre = strings(item.metadata.genres)[0];
  const year = item.releaseDate?.slice(0, 4);
  // Sin autor ni género, la descripción explica mejor qué es («película de 1987 dirigida por…»).
  const parts = creators.length || genre ? [creators.join(', '), year, genre] : [description, year];
  const line = parts.filter((p): p is string => Boolean(p)).join(' · ');
  return line || null;
}

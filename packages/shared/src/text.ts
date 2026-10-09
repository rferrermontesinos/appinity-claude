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

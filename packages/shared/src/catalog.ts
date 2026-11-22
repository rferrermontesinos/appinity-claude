import { z } from 'zod';
import { CATEGORIES, type Category } from './categories.js';

export const categorySchema = z.enum(CATEGORIES);

/** Precisión real de una fecha: no se inventa el día si solo se conoce el año. */
export type DatePrecision = 'day' | 'month' | 'year';
export const datePrecisionSchema = z.enum(['day', 'month', 'year']);

/**
 * Imagen de catálogo (contrato de la especificación §6).
 * `isFallback` indica la imagen de sustitución de la categoría: nunca una fotografía fabricada.
 */
export interface CatalogImage {
  url: string;
  storageKey?: string;
  source: string;
  sourceImageId?: string;
  width?: number;
  height?: number;
  alt: string;
  attribution?: string;
  rightsOrPolicyReference?: string;
  fetchedAt?: string;
  expiresAt?: string;
  isFallback: boolean;
}

export const catalogImageSchema = z.object({
  url: z.string().min(1).max(2048),
  storageKey: z.string().max(512).optional(),
  source: z.string().min(1).max(64),
  sourceImageId: z.string().max(512).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().max(512),
  attribution: z.string().max(1024).optional(),
  rightsOrPolicyReference: z.string().max(1024).optional(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  isFallback: z.boolean(),
}) satisfies z.ZodType<CatalogImage>;

export interface CatalogLocation {
  latitude: number;
  longitude: number;
  locality?: string;
  countryCode?: string;
}

export const catalogLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locality: z.string().max(128).optional(),
  countryCode: z.string().length(2).optional(),
});

/** Objeto canónico del catálogo (§6). `externalIds` usa claves "proveedor:tipo". */
export interface CatalogItem {
  id: string;
  category: Category;
  itemType: string;
  title: string;
  description?: string;
  primaryImage: CatalogImage;
  externalIds: Record<string, string>;
  externalLinks: Array<{ provider: string; url: string }>;
  releaseDate?: string;
  releaseDatePrecision?: DatePrecision;
  eventStartsAt?: string;
  eventEndsAt?: string;
  parentItemId?: string;
  location?: CatalogLocation;
  metadata: Record<string, unknown>;
}

/**
 * Identificador externo con espacio de nombres. Los IDs numéricos de un mismo proveedor
 * no se confunden: tmdb:movie:289 y tmdb:tv:289 son objetos distintos.
 */
export interface ExternalIdRef {
  provider: string;
  idType: string;
  value: string;
}

export const externalIdRefSchema = z.object({
  provider: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  idType: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  value: z.string().min(1).max(256),
});

export function externalIdKey(ref: Pick<ExternalIdRef, 'provider' | 'idType'>): string {
  return `${ref.provider}:${ref.idType}`;
}

/** Proveedores cuyos IDs identifican el objeto entre plataformas (resolución prioritaria). */
export const CANONICAL_ID_KEYS = [
  'wikidata:entity',
  'imdb:title',
  'musicbrainz:artist',
  'openlibrary:work',
  'isbn:isbn13',
  'freebase:mid',
] as const;

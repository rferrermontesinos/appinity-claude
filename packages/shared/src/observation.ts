import { z } from 'zod';
import type { Category } from './categories.js';
import { catalogImageSchema, catalogLocationSchema, categorySchema, type CatalogImage, type CatalogLocation } from './catalog.js';
import type { ProfileSourceKey } from './sources.js';

/** Base de la preferencia, de mayor a menor prioridad en la consolidación (§10). */
export const PREFERENCE_BASES = [
  'explicit_rating',
  'explicit_like',
  'strong_behavior',
  'attendance',
  'weak_behavior',
] as const;
export type PreferenceBasis = (typeof PREFERENCE_BASES)[number];

/** Prioridad numérica: mayor valor, mayor prioridad. */
export const PREFERENCE_BASIS_PRIORITY: Record<PreferenceBasis, number> = {
  explicit_rating: 5,
  explicit_like: 4,
  strong_behavior: 3,
  attendance: 2,
  weak_behavior: 1,
};

export const ENGAGEMENT_TYPES = [
  'rating',
  'liked',
  'played',
  'listened',
  'attendance',
  'review',
  'owned',
  'saved',
  'completed',
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export type TimestampPrecision = 'instant' | 'day' | 'year';

/**
 * Datos opcionales que ayudan a resolver el objeto sin fusionar por título parecido.
 * Ampliación compatible del contrato §7 (documentada en docs/decisions.md).
 */
export interface ExternalItemAttributes {
  releaseYear?: number;
  creators?: string[];
  location?: CatalogLocation;
}

/** Contrato común de observaciones (§7). Las fechas cruzan APIs y colas como ISO 8601. */
export interface NormalizedObservation {
  userId: string;
  source: ProfileSourceKey;
  sourceRecordId: string;
  observationKind: string;
  mapperVersion: string;
  category: Category;
  externalItem: {
    sourceId: string;
    itemType: string;
    title: string;
    canonicalIds?: Record<string, string>;
    imageCandidate?: CatalogImage;
    attributes?: ExternalItemAttributes;
  };
  occurredAt?: string;
  timestampPrecision?: TimestampPrecision;
  knownConfidence: number;
  consumedConfidence: number;
  preferenceScore: number | null;
  preferenceConfidence: number | null;
  preferenceBasis: PreferenceBasis | null;
  engagement?: {
    type: EngagementType;
    value?: number;
    unit?: string;
  };
  metadata?: Record<string, unknown>;
}

const confidence = z.number().min(0).max(1);
const identifierKey = z.string().regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/, 'Clave "proveedor:tipo"');

export const normalizedObservationSchema = z
  .object({
    userId: z.uuid(),
    source: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
    sourceRecordId: z.string().min(1).max(512),
    observationKind: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
    mapperVersion: z.string().min(1).max(32),
    category: categorySchema,
    externalItem: z.object({
      sourceId: z.string().min(1).max(512),
      itemType: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
      title: z.string().trim().min(1).max(512),
      canonicalIds: z.record(identifierKey, z.string().min(1).max(256)).optional(),
      imageCandidate: catalogImageSchema.optional(),
      attributes: z
        .object({
          releaseYear: z.number().int().min(1000).max(3000).optional(),
          creators: z.array(z.string().min(1).max(256)).max(20).optional(),
          location: catalogLocationSchema.optional(),
        })
        .optional(),
    }),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    timestampPrecision: z.enum(['instant', 'day', 'year']).optional(),
    knownConfidence: confidence,
    consumedConfidence: confidence,
    preferenceScore: z.number().min(-1).max(1).nullable(),
    preferenceConfidence: confidence.nullable(),
    preferenceBasis: z.enum(PREFERENCE_BASES).nullable(),
    engagement: z
      .object({
        type: z.enum(ENGAGEMENT_TYPES),
        value: z.number().optional(),
        unit: z.string().max(32).optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((o, ctx) => {
    const nulls = [o.preferenceScore === null, o.preferenceConfidence === null, o.preferenceBasis === null];
    if (nulls.some((n) => n !== nulls[0])) {
      ctx.addIssue({
        code: 'custom',
        path: ['preferenceScore'],
        message: 'preferenceScore, preferenceConfidence y preferenceBasis deben ser todos NULL o todos no NULL',
      });
    }
    if (o.preferenceConfidence === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['preferenceConfidence'],
        message: 'Una preferencia sin confianza se expresa con NULL, no con confianza 0',
      });
    }
    if (o.consumedConfidence > o.knownConfidence) {
      ctx.addIssue({
        code: 'custom',
        path: ['consumedConfidence'],
        message: 'Consumir implica conocer: consumedConfidence no puede superar knownConfidence',
      });
    }
    if ((o.occurredAt === undefined) !== (o.timestampPrecision === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['timestampPrecision'],
        message: 'occurredAt y timestampPrecision van juntos: sin fecha no hay precisión',
      });
    }
  });

/** Valida en runtime y devuelve la observación tipada o lanza un error con el detalle. */
export function parseObservation(input: unknown): NormalizedObservation {
  return normalizedObservationSchema.parse(input) as NormalizedObservation;
}

export function safeParseObservation(
  input: unknown,
): { success: true; data: NormalizedObservation } | { success: false; error: string } {
  const result = normalizedObservationSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data as NormalizedObservation };
  return { success: false, error: z.prettifyError(result.error) };
}

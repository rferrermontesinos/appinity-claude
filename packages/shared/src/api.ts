import type { Category } from './categories.js';
import type { CatalogImage, DatePrecision, ExternalIdRef } from './catalog.js';
import type { EngagementType, PreferenceBasis, TimestampPrecision } from './observation.js';
import type { ConnectionStatus, ProfileSourceManifest } from './sources.js';

/** Conjunto de datos al que pertenece un usuario u objeto: la demo nunca se mezcla con datos reales. */
export type Dataset = 'demo' | 'live';

export interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  service: 'appinity-api';
  version: string;
  time: string;
  mode: { environment: string; demoMode: boolean; devAuth: boolean };
  checks: { database: CheckResult; postgis: CheckResult; redis: CheckResult; worker: CheckResult };
}

export interface DevUserDto {
  id: string;
  handle: string;
  displayName: string;
  countryCode: string | null;
  description: string;
}

export type NotificationFrequency = 'daily' | 'three_per_week' | 'weekly' | 'off';
export type SupportedLocale = 'es' | 'en';

export interface LocationDto {
  label: string;
  latitude: number;
  longitude: number;
  source: 'manual' | 'device';
}

export interface SettingsDto {
  locale: SupportedLocale;
  radiusKm: number;
  location: LocationDto | null;
  timeZone: string;
  discoverableByContacts: boolean;
  notificationFrequency: NotificationFrequency;
}

export interface MeDto {
  user: {
    id: string;
    handle: string;
    displayName: string;
    countryCode: string | null;
    dataset: Dataset;
  };
  settings: SettingsDto;
  /** Tipo de sesión. En esta fase solo existe la identidad de desarrollo. */
  authKind: 'dev';
}

export interface DevSessionDto {
  token: string;
  expiresAt: string;
  me: MeDto;
}

export interface SourceDto extends ProfileSourceManifest {
  connectable: boolean;
  /** Motivo por el que una fuente real no se puede conectar todavía (p. ej. falta configuración). */
  unavailableReason?: string;
  plannedPhase?: string;
  /** La autorización se puede renovar sobre la misma conexión sin perder lo importado. */
  supportsRenewal?: boolean;
}

/**
 * Resultado de iniciar una conexión: inmediata (fuentes simuladas) o con redirección al proveedor. `localOnly`: el
 * proveedor solo puede volver a este PC (Google en desarrollo), así que el flujo debe hacerse en su navegador.
 * `renewal`: renueva la autorización de una conexión existente.
 */
export type ConnectStartDto =
  | { kind: 'connected'; connection: ConnectionDto; run: SyncRunDto }
  | { kind: 'redirect'; authorizationUrl: string; expiresAt: string; localOnly?: boolean; renewal?: boolean };

/**
 * Resultado de desconectar. `providerRevocation`: si el proveedor confirmó que invalidó el acceso (p. ej. el permiso
 * de Google), si no lo confirmó (en APPINITY ya está borrado) o si no había nada que revocar (Steam, simuladas).
 */
export interface DisconnectResultDto {
  purgedObservations: number;
  affectedItems: number;
  providerRevocation: 'revoked' | 'failed' | 'not_applicable';
}

export type SyncRunStatus ='queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';

export interface ConnectionDto {
  id: string;
  sourceKey: string;
  sourceName: string;
  simulated: boolean;
  status: ConnectionStatus;
  createdAt: string;
  lastSyncAt: string | null;
  lastSyncStatus: SyncRunStatus | null;
  lastError: string | null;
  observationCount: number;
  /** Cuenta externa vinculada, abreviada (p. ej. SteamID terminado en …1234). */
  externalAccountHint: string | null;
  /** Permisos que la fuente pide ahora y la conexión no tiene (renovar el permiso los añade). */
  missingScopes: number;
}

export interface SyncRunDto {
  id: string;
  connectionId: string;
  status: SyncRunStatus;
  trigger: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  recordsReceived: number;
  observationsInserted: number;
  observationsUpdated: number;
  observationsUnchanged: number;
  itemsCreated: number;
  partialErrors: Array<{ sourceRecordId?: string; code: string; message: string }>;
  errorMessage: string | null;
}

/** Imagen con la atribución que exige su licencia (si la hay). */
export interface CatalogImageDto extends CatalogImage {
  license?: string;
  licenseUrl?: string;
  author?: string;
  descriptionUrl?: string;
}

export interface CatalogItemDto {
  id: string;
  dataset: Dataset;
  category: Category;
  itemType: string;
  title: string;
  description: string | null;
  primaryImage: CatalogImageDto;
  externalIds: ExternalIdRef[];
  externalLinks: Array<{ provider: string; url: string }>;
  releaseDate: string | null;
  releaseDatePrecision: DatePrecision | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  parentItemId: string | null;
  location: { latitude: number; longitude: number; locality: string | null; countryCode: string | null } | null;
  metadata: Record<string, unknown>;
}

/** Afinidad de una categoría hacia otra persona. `score` NULL = sin evidencia comparable suficiente. */
export interface AffinityCategoryDto {
  category: Category;
  score: number | null;
  confidence: number | null;
  /** Objetos con preferencia en ambos (solo el recuento, nunca cuáles). */
  commonItems: number;
}

/** Afinidad direccional «yo → otra persona» (§4 y §11). */
export interface AffinityDto {
  targetUserId: string;
  /** 0–100 o NULL (la app muestra «—»). No es una probabilidad. */
  score: number | null;
  confidence: number | null;
  categoriesCompared: number;
  /** Las ocho categorías, en el orden canónico. */
  categories: AffinityCategoryDto[];
  /** Ambas direcciones ≥ 90 («Afinidad mutua excepcional»). */
  exceptionalMutual: boolean;
  algorithmVersion: string | null;
  computedAt: string | null;
}

/** Una persona del ranking de almas gemelas: perfil mínimo y afinidad global (nunca historiales). */
export interface SoulmateDto {
  rank: number;
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  score: number;
  confidence: number;
  categoriesCompared: number;
  exceptionalMutual: boolean;
}

export interface SoulmatesDto {
  items: SoulmateDto[];
  /** Máximo de la versión gratuita (50). Puede haber menos personas: no se rellena. */
  limit: number;
  algorithmVersion: string;
}

/** Perfil público mínimo (§4): nombre, país, foto y afinidades. Sin historiales importados. */
export interface PublicPersonDto {
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  affinity: AffinityDto;
}

export type RecommendationBlockDto = 'consensus' | 'discovery' | 'trending';

/**
 * Motivo verificable de una tarjeta (§2 y §12): para el consenso, cuántas almas gemelas la apoyan (nunca quiénes); para
 * el descubrimiento, la persona que la aporta; para Trending, cuántas personas de la zona la votaron este año.
 */
export interface RecommendationReasonDto {
  code: RecommendationBlockDto;
  supporters?: number;
  opinionated?: number;
  contributor?: { userId: string; displayName: string };
  positiveVoters?: number;
  totalVoters?: number;
}

export interface RecommendationDto {
  item: CatalogItemDto;
  block: RecommendationBlockDto;
  /** Ocupa el hueco de otro bloque sin candidatos (la cuota 70/20/10 es un objetivo, no se rellena inventando). */
  fillsFor: RecommendationBlockDto | null;
  reason: RecommendationReasonDto;
  /** NEW: APPINITY nunca había mostrado este objeto a este usuario (no significa estreno). */
  isNew: boolean;
}

export interface HomeImpressionResultDto {
  isNew: boolean;
}

export interface HomeActionResultDto {
  actionId: string;
}

export interface HomeUndoResultDto {
  itemId: string;
  action: 'dismiss' | 'keep';
}

export interface RecommendationsDto {
  items: RecommendationDto[];
  available: Record<RecommendationBlockDto, number>;
  trending: { status: 'ok' | 'no_location' | 'insufficient_votes'; year: number; radiusKm: number | null; minVoters: number };
  /** Sin ubicación no se recomiendan lugares (no se presume ninguna zona). */
  localFilter: 'radius' | 'no_location';
  algorithmVersion: string;
}

export interface ItemProfileDto {
  item: CatalogItemDto;
  knownConfidence: number;
  consumedConfidence: number;
  preferenceScore: number | null;
  preferenceConfidence: number | null;
  preferenceBasis: PreferenceBasis | null;
  evidenceCount: number;
  sourceCount: number;
  sources: string[];
  hasConflict: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  consolidationVersion: string;
  updatedAt: string;
}

export interface ObservationDto {
  id: string;
  sourceKey: string;
  connectionId: string;
  sourceRecordId: string;
  observationKind: string;
  mapperVersion: string;
  knownConfidence: number;
  consumedConfidence: number;
  preferenceScore: number | null;
  preferenceConfidence: number | null;
  preferenceBasis: PreferenceBasis | null;
  engagement: { type: EngagementType; value?: number; unit?: string } | null;
  occurredAt: string | null;
  timestampPrecision: TimestampPrecision | null;
  syncedAt: string;
  metadata: Record<string, unknown>;
}

export interface ItemProfileDetailDto {
  item: CatalogItemDto;
  profile: ItemProfileDto | null;
  /** Solo evidencias del propio usuario autenticado. */
  observations: ObservationDto[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorDto {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

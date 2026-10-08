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
}

export type SyncRunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';

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

import type { Category } from './categories.js';
import type { CatalogImage, CatalogItem, ExternalIdRef } from './catalog.js';
import type { ExternalItemAttributes, NormalizedObservation } from './observation.js';

/**
 * Fuentes simuladas de la demo (DEMO_MODE). Imitan clases de evidencia de fuentes reales,
 * pero nunca se presentan como conexiones reales.
 */
export const FIXTURE_SOURCE_KEYS = [
  'fixture_screen',
  'fixture_diary',
  'fixture_activity',
  'fixture_play',
  'fixture_audio',
] as const;
export type FixtureSourceKey = (typeof FIXTURE_SOURCE_KEYS)[number];

/**
 * Fuentes reales del MVP (§9, revisión 1.1 y docs/fuentes-de-datos.md). Ninguna está disponible hasta validarla en su
 * fase. Las que exigen acuerdo comercial (Spotify, Last.fm, TMDb…) no figuran hasta firmarlo.
 */
export const PLANNED_SOURCE_KEYS = [
  'steam',
  'google_portability',
  'google_books',
  'apple_music',
  'device_calendar',
  'itchio',
  'soundcloud',
  'eventbrite',
  'meetup',
  'swarm',
] as const;
export type PlannedSourceKey = (typeof PLANNED_SOURCE_KEYS)[number];

export type ProfileSourceKey = FixtureSourceKey | PlannedSourceKey;

export function isFixtureSourceKey(key: string): key is FixtureSourceKey {
  return (FIXTURE_SOURCE_KEYS as readonly string[]).includes(key);
}

/**
 * Mecanismos de autenticación (§8). `fixture` es una ampliación de esta implementación para
 * las fuentes simuladas: no hay OAuth ni credenciales y nunca se simula un éxito OAuth.
 */
export type SourceAuthentication =
  | 'oauth2'
  | 'oauth1'
  | 'api-key'
  | 'openid'
  | 'provider-session'
  | 'native-permission'
  | 'public-identifier'
  | 'fixture';

export type SyncStrategy = 'webhook' | 'incremental' | 'scheduled' | 'full-refresh';

/** Estado de disponibilidad declarado en el manifest. */
export type SourceAvailability = 'fixture' | 'planned' | 'available' | 'unconfigured';

export interface ProfileSourceManifest {
  key: ProfileSourceKey;
  name: string;
  categories: Category[];
  authentication: SourceAuthentication;
  syncStrategy: SyncStrategy;
  capabilities: {
    known: boolean;
    consumed: boolean;
    explicitRating: boolean;
    implicitPreference: boolean;
    history: boolean;
    incrementalSync: boolean;
  };
  /** Ampliación: disponibilidad real y si los datos son simulados. */
  availability: SourceAvailability;
  simulated: boolean;
  description: string;
}

export type ConnectionStatus = 'active' | 'error' | 'revoked';

/** Cursor opaco y serializable que persiste entre syncs; solo avanza tras un sync correcto. */
export type SyncCursor = Record<string, string | number | boolean | null>;

export interface UserConnection {
  id: string;
  userId: string;
  sourceKey: ProfileSourceKey;
  status: ConnectionStatus;
  externalAccountRef?: string | null;
  cursor: SyncCursor | null;
  watermarkAt?: string | null;
}

/** Credenciales descifradas: solo existen en memoria del backend/worker, nunca en el cliente. */
export type SourceCredentials = Record<string, string>;

export interface ConnectContext {
  userId: string;
  locale?: string;
  /** URL de vuelta (callback de la API) para flujos con redirección, con el `state` ya incluido. */
  redirectUri?: string;
  /** Origen (realm) que el proveedor muestra al usuario al autorizar. */
  realm?: string;
  params?: Record<string, string>;
}

/** Datos con los que el proveedor vuelve al callback de la API en un flujo con redirección. */
export interface CompleteConnectContext {
  userId: string;
  redirectUri: string;
  callbackParams: Record<string, string>;
}

export type AuthResult =
  | { kind: 'connected'; externalAccountRef?: string; credentials?: SourceCredentials; scopes: string[] }
  | { kind: 'redirect'; url: string; state: string }
  | { kind: 'unavailable'; reason: string };

export interface SyncContext {
  connection: UserConnection;
  credentials?: SourceCredentials;
  cursor: SyncCursor | null;
  pageSize: number;
  now: Date;
  /** Señal de cancelación (estructural para no depender de tipos DOM/Node). */
  signal?: { readonly aborted: boolean };
}

export interface SyncPartialError {
  sourceRecordId?: string;
  code: string;
  message: string;
}

/** Lote de sync (§8): registros, cursor, watermark, errores parciales y completitud. */
export interface SyncBatch {
  records: unknown[];
  cursor: SyncCursor | null;
  hasMore: boolean;
  watermarkAt?: string;
  partialErrors: SyncPartialError[];
  /** true cuando el lote forma parte de una instantánea completa (p. ej. biblioteca entera). */
  snapshotComplete: boolean;
  /** Estadísticas del propio usuario calculadas sobre la instantánea (p. ej. percentiles). */
  stats?: Record<string, number>;
}

export interface NormalizeContext {
  userId: string;
  connectionId: string;
  source: ProfileSourceKey;
  stats?: Record<string, number>;
}

export interface ProfileSourceAdapter {
  manifest: ProfileSourceManifest;
  /**
   * Ampliación: tipos de observación que forman una instantánea completa (biblioteca, recuento de escuchas).
   * Tras un sync completo, las evidencias de esos tipos que ya no aparecen se eliminan.
   */
  snapshotObservationKinds?: readonly string[];
  connect(context: ConnectContext): Promise<AuthResult>;
  /** Ampliación: completa un flujo con redirección (OpenID/OAuth) verificando la respuesta del proveedor. */
  completeConnect?(context: CompleteConnectContext): Promise<AuthResult>;
  refreshConnection?(connection: UserConnection): Promise<UserConnection>;
  sync(context: SyncContext): Promise<SyncBatch>;
  normalize(record: unknown, context: NormalizeContext): Promise<NormalizedObservation[]>;
  disconnect(connection: UserConnection): Promise<void>;
}

export interface CatalogSearch {
  query: string;
  category?: Category;
  limit?: number;
}

/** Candidato a objeto canónico procedente de una observación. */
export interface ExternalItemCandidate {
  category: Category;
  itemType: string;
  title: string;
  sourceKey: string;
  sourceId: string;
  canonicalIds?: Record<string, string>;
  attributes?: ExternalItemAttributes;
  imageCandidate?: CatalogImage;
}

export type MatchMethod = 'canonical_id' | 'provider_id' | 'attributes';

/** Imagen tal como la entrega un proveedor de catálogo, con su licencia y autoría. */
export interface ProviderImage {
  url: string;
  originalUrl?: string;
  source: string;
  sourceImageId?: string;
  width?: number;
  height?: number;
  mime?: string;
  alt: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  attributionRequired?: boolean;
  descriptionUrl?: string;
  restrictions?: string;
}

/**
 * Objeto devuelto por un proveedor de catálogo. Puede llegar sin imagen durante la resolución (§6): el
 * fallback de la categoría se aplica al publicar el DTO, nunca se fabrica una foto.
 */
export interface ProviderCatalogItem extends Omit<CatalogItem, 'primaryImage' | 'externalIds' | 'parentItemId'> {
  /** Identificador del objeto en el proveedor (p. ej. QID de Wikidata). */
  id: string;
  primaryImage: ProviderImage | null;
  externalIds: ExternalIdRef[];
  /** Identificador en el proveedor del objeto padre (obra de una edición, serie de una temporada). */
  parentId?: string;
  eventDatePrecision?: 'day' | 'instant';
}

export interface CatalogMatch {
  item: ProviderCatalogItem;
  matchedBy: MatchMethod;
  /** Confianza documentada del método de resolución (0–1). */
  confidence: number;
}

export interface TrendingContext {
  category: Category;
  now: Date;
  timeZone: string;
}

/**
 * Proveedor de catálogo (§8): identifica objetos y aporta metadatos e imágenes. Ampliación: devuelve
 * `ProviderCatalogItem` (imagen opcional y IDs con espacio de nombres) en lugar de `CatalogItem`.
 */
export interface CatalogProvider {
  key: string;
  search(query: CatalogSearch): Promise<ProviderCatalogItem[]>;
  getItem(externalId: string): Promise<ProviderCatalogItem>;
  resolve(candidate: ExternalItemCandidate): Promise<CatalogMatch | null>;
  getTrending?(context: TrendingContext): Promise<ProviderCatalogItem[]>;
}

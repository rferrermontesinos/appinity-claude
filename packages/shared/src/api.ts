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
  /** Aparecer en el ranking de almas gemelas de otras personas. */
  discoverableAsSoulmate: boolean;
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
  authKind: 'dev' | 'user';
  /** Falta el alta (mayoría de edad y condiciones). */
  needsOnboarding: boolean;
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
  /** Relación vista por quien consulta (un rechazo se muestra como «pendiente» a quien envió la solicitud). */
  friendship: { state: 'none' | 'pending_out' | 'pending_in' | 'friends'; requestId: string | null };
  /** Relación de chat vista por quien consulta (una solicitud ignorada se le sigue mostrando «enviada»). */
  chat: ChatStateDto;
}

/** Chat (§16, fase 12A): interés → match → conversación. */
export type ChatStateDto =
  | { state: 'none' }
  | { state: 'request_sent'; kind: 'interest' | 'direct' }
  | { state: 'request_received'; requestId: string; kind: 'interest' | 'direct'; firstMessage: string | null }
  | { state: 'matched'; conversationId: string };

/** Autenticación de producción (fase 13). */
export interface AuthProvidersDto {
  google: boolean;
  dev: boolean;
}

export interface AuthSessionDto {
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
  isNew: boolean;
  needsOnboarding: boolean;
}

/** Notificaciones (fase 12C): dispositivos registrados y último resumen. */
export interface NotificationsStatusDto {
  devices: number;
  lastDelivery: { localDate: string; status: 'sent' | 'empty' | 'no_tokens' | 'failed'; createdAt: string } | null;
}

/** Premium (fase 12B): estado verificado en servidor a partir de RevenueCat. */
export interface PremiumDto {
  premium: boolean;
  /** Entorno cuyas compras cuentan en esta instalación. */
  environment: 'sandbox' | 'production';
  productId: string | null;
  expiresAt: string | null;
  source: 'revenuecat';
  /** El servidor tiene configurado el webhook de RevenueCat. */
  webhookConfigured: boolean;
  /** La app puede comprar (SDK de RevenueCat integrado en una build de desarrollo). Falso en Expo Go. */
  purchasesInApp: boolean;
}

export interface ChatConfigDto {
  /** EARLY_ACCESS: chat gratuito con solicitud y aceptación. */
  earlyAccess: boolean;
  /** PREMIUM_DIRECT_MESSAGE activo en el servidor. */
  premiumDirectMessage: boolean;
  /** Entitlement verificado en servidor. Falso mientras no exista RevenueCat (fase 12B). */
  premium: boolean;
  premiumSource: 'revenuecat';
  limits: { requestsPerDay: number; messagesPerMinute: number; messagesPerDay: number; bodyMaxLength: number };
}

export interface ChatMatchResultDto {
  state: ChatStateDto['state'];
  conversationId: string | null;
  /** Se acaba de producir el match: la app muestra «¡Es un match!». */
  newMatch: boolean;
}

export interface ChatPersonDto {
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  /** Afinidad ya calculada (el chat nunca la modifica). NULL: «—». */
  affinity: number | null;
}

export interface ChatListItemDto {
  conversationId: string;
  person: ChatPersonDto;
  matchedAt: string;
  isNew: boolean;
  lastMessage: { body: string; mine: boolean; createdAt: string } | null;
  unread: number;
}

export interface ChatRequestDto {
  requestId: string;
  kind: 'interest' | 'direct';
  firstMessage: string | null;
  person: ChatPersonDto;
  createdAt: string;
}

export interface ChatInboxDto {
  matches: ChatListItemDto[];
  conversations: ChatListItemDto[];
  requests: ChatRequestDto[];
  badge: number;
}

export interface ChatMessageDto {
  id: string;
  senderId: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface ChatConversationDto {
  conversation: { id: string; origin: string; matchedAt: string; person: ChatPersonDto; otherLastReadAt: string | null };
  messages: ChatMessageDto[];
  hasMore: boolean;
}

export interface FriendDto {
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  /** Mi afinidad hacia esa persona; NULL («—») si no hay evidencia comparable. Los amigos no tienen por qué ser afines. */
  affinity: number | null;
  requestId: string;
}

export interface FriendsDto {
  friends: FriendDto[];
  incoming: FriendDto[];
  outgoing: FriendDto[];
}

export interface FriendshipResultDto {
  state: 'none' | 'pending_out' | 'pending_in' | 'friends';
}

export interface BlockedPersonDto {
  userId: string;
  displayName: string;
}

/**
 * Bloques principales (70/20/10) y respaldos cuando se agotan (fase 9): comunidad (valorado por varias personas de
 * APPINITY), conservados en otra sesión y explorar (sin señales todavía). Cada tarjeta dice de dónde sale.
 */
export type RecommendationBlockDto = 'consensus' | 'discovery' | 'trending' | 'community' | 'kept' | 'explore';

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
  fillsFor: 'consensus' | 'discovery' | 'trending' | null;
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

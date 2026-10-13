import { SourceError } from '@appinity/shared';
import { createHash, randomBytes } from 'node:crypto';
import {
  ARCHIVE_MAX_BYTES,
  GOOGLE_AUTH_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  PORTABILITY_API_BASE,
  PORTABILITY_SCOPE_PREFIX,
  type ResourceGroup,
} from './constants.js';
import {
  accessTypeSchema,
  archiveStateSchema,
  googleErrorSchema,
  initiateResponseSchema,
  retryResponseSchema,
  tokenResponseSchema,
  type ArchiveState,
  type TokenResponse,
} from './schemas.js';

export interface GoogleClientOptions {
  clientId: string;
  clientSecret: string;
  /** URL de vuelta registrada en el cliente OAuth de Google (debe coincidir exactamente). */
  redirectUri: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

/** Google limita los exports: acceso único ya usado o acceso temporal antes de 24 h. */
export class ExportLimitError extends Error {
  constructor(
    readonly kind: 'one_time' | 'time_based',
    message: string,
  ) {
    super(message);
    this.name = 'ExportLimitError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/**
 * Cliente de OAuth de Google y de la Data Portability API (solo servidor). Ningún token ni secreto aparece en los
 * mensajes de error. Los errores 5xx y de red se reintentan; los de autorización requieren que el usuario renueve.
 */
export class GooglePortabilityClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly options: GoogleClientOptions) {
    if (!options.clientId || !options.clientSecret) {
      throw new SourceError('not_configured', 'Faltan GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET en el servidor', false);
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 3;
  }

  get redirectUri(): string {
    return this.options.redirectUri;
  }

  /** URL de consentimiento: solo scopes de Data Portability, acceso offline (refresh token) y PKCE. */
  authorizationUrl(input: { state: string; codeChallenge: string; groups: readonly ResourceGroup[] }): string {
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', this.options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', input.groups.map((g) => `${PORTABILITY_SCOPE_PREFIX}${g}`).join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
    return this.token({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.options.redirectUri,
    });
  }

  /** Nuevo access token. Un refresh token caducado o revocado exige que el usuario renueve el permiso. */
  async refresh(refreshToken: string): Promise<string> {
    const response = await this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
    return response.access_token;
  }

  async revoke(token: string): Promise<void> {
    await this.fetchImpl(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(15_000),
    });
  }

  private async token(params: Record<string, string>): Promise<TokenResponse> {
    const body = new URLSearchParams({ client_id: this.options.clientId, client_secret: this.options.clientSecret, ...params });
    const response = await this.send(GOOGLE_TOKEN_URL, { method: 'POST', body, contentType: 'application/x-www-form-urlencoded' });
    if (response.status === 400 || response.status === 401) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (data.error === 'invalid_grant') {
        throw new SourceError('auth', 'El permiso de Google ha caducado o se ha revocado: renuévalo desde la app', false);
      }
      throw new SourceError('auth', `Google rechazó la autorización (${data.error ?? response.status}): revisa la configuración OAuth`, false);
    }
    if (!response.ok) throw new SourceError('bad_response', `Google respondió HTTP ${response.status} al pedir el token`, false);
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SourceError('bad_response', 'Respuesta inesperada del servidor de tokens de Google', false);
    return parsed.data;
  }

  async initiate(accessToken: string, group: ResourceGroup): Promise<{ jobId: string; accessType?: string }> {
    const data = initiateResponseSchema.safeParse(await this.api(accessToken, 'POST', '/v1/portabilityArchive:initiate', { resources: [group] }));
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada al iniciar el export de Google', false);
    return { jobId: data.data.archiveJobId, ...(data.data.accessType ? { accessType: data.data.accessType } : {}) };
  }

  async state(accessToken: string, jobId: string): Promise<ArchiveState> {
    const data = archiveStateSchema.safeParse(
      await this.api(accessToken, 'GET', `/v1/archiveJobs/${encodeURIComponent(jobId)}/portabilityArchiveState`),
    );
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada del estado del export de Google', false);
    return data.data;
  }

  async retry(accessToken: string, jobId: string): Promise<string> {
    const data = retryResponseSchema.safeParse(await this.api(accessToken, 'POST', `/v1/archiveJobs/${encodeURIComponent(jobId)}:retry`, {}));
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada al reintentar el export de Google', false);
    return data.data.archiveJobId;
  }

  async accessType(accessToken: string): Promise<{ oneTime: string[]; timeBased: string[] }> {
    const data = accessTypeSchema.safeParse(await this.api(accessToken, 'POST', '/v1/accessType:check', {}));
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada del tipo de acceso de Google', false);
    return { oneTime: data.data.oneTimeResources ?? [], timeBased: data.data.timeBasedResources ?? [] };
  }

  /** Revoca todos los permisos de Data Portability concedidos a esta app (al desconectar). */
  async reset(accessToken: string): Promise<void> {
    await this.api(accessToken, 'POST', '/v1/authorization:reset', {});
  }

  /** Descarga un archivo del export (URL firmada de Cloud Storage: sin cabecera de autorización). */
  async download(url: string): Promise<Uint8Array> {
    const response = await this.send(url, { method: 'GET' });
    if (!response.ok) throw new SourceError('unavailable', `No se pudo descargar el export de Google (HTTP ${response.status})`, true);
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > ARCHIVE_MAX_BYTES) throw new SourceError('bad_response', 'El export de Google es demasiado grande', false);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > ARCHIVE_MAX_BYTES) throw new SourceError('bad_response', 'El export de Google es demasiado grande', false);
    return bytes;
  }

  private async api(accessToken: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const response = await this.send(new URL(path, PORTABILITY_API_BASE).toString(), {
      method,
      authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { body: JSON.stringify(body), contentType: 'application/json' } : {}),
    });
    if (response.ok) return response.json().catch(() => ({}));
    const parsed = googleErrorSchema.safeParse(await response.json().catch(() => ({})));
    const status = parsed.success ? parsed.data.error.status : undefined;
    const reasons = parsed.success ? (parsed.data.error.details ?? []).map((d) => d.reason ?? '') : [];
    if (response.status === 429 && reasons.some((r) => r.includes('ONE_TIME'))) {
      throw new ExportLimitError('one_time', 'El acceso único a este grupo ya se usó');
    }
    if (response.status === 429 && (reasons.some((r) => r.includes('TIME_BASED')) || status === 'RESOURCE_EXHAUSTED')) {
      throw new ExportLimitError('time_based', 'Google solo permite un export de cada grupo cada 24 h');
    }
    if (status === 'FAILED_PRECONDITION') throw new ExportLimitError('time_based', 'Google aún no permite otro export de este grupo');
    if (response.status === 401) {
      throw new SourceError('auth', 'El permiso de Google ya no es válido: renuévalo desde la app', false);
    }
    if (response.status === 403) {
      throw new SourceError(
        'profile_inaccessible',
        'Google no permite exportar estos datos (¿API no activada en el proyecto, cuenta no admitida o país sin Data Portability?)',
        false,
      );
    }
    throw new SourceError('bad_response', `La Data Portability API respondió HTTP ${response.status} (${status ?? 'sin estado'})`, false);
  }

  /** Petición con reintentos ante red caída, 5xx y 429 genéricos (no los límites de export, que se tratan aparte). */
  private async send(
    url: string,
    init: { method: string; body?: URLSearchParams | string; contentType?: string; authorization?: string },
  ): Promise<Response> {
    let last: SourceError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          method: init.method,
          headers: {
            Accept: 'application/json',
            ...(init.contentType ? { 'Content-Type': init.contentType } : {}),
            ...(init.authorization ? { Authorization: init.authorization } : {}),
          },
          ...(init.body !== undefined ? { body: init.body } : {}),
          signal: AbortSignal.timeout(60_000),
        });
        if (response.status >= 500) {
          last = new SourceError('unavailable', `Google no está disponible (HTTP ${response.status})`, true);
        } else {
          return response;
        }
      } catch {
        last = new SourceError('unavailable', 'No se pudo contactar con Google (red o tiempo de espera)', true);
      }
      if (attempt < this.maxRetries) await this.sleep(1_000 * 2 ** attempt);
    }
    throw last ?? new SourceError('unavailable', 'Google no responde', true);
  }
}

export function scopesToGroups(scope: string | undefined): string[] {
  return (scope ?? '')
    .split(/\s+/)
    .filter((s) => s.startsWith(PORTABILITY_SCOPE_PREFIX))
    .map((s) => s.slice(PORTABILITY_SCOPE_PREFIX.length));
}

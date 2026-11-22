import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

/**
 * «Continuar con Google» (OpenID Connect, flujo de código con PKCE y nonce). Gratuito y con el mismo cliente OAuth que
 * Data Portability, pero en una autorización aparte: Google no permite mezclar scopes de Data Portability con
 * `openid`. El ID token se verifica con las claves públicas de Google (firma, emisor, audiencia, caducidad y nonce).
 * Documentación: developers.google.com/identity/openid-connect/openid-connect.
 */
export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const tokenSchema = z.object({
  id_token: z.string().min(20),
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});
export type GoogleSignInTokens = Omit<z.infer<typeof tokenSchema>, 'id_token'>;
export const GOOGLE_BOOKS_SCOPE = 'https://www.googleapis.com/auth/books';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

export interface GoogleOidcOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  /** Claves para verificar el ID token (por defecto, las públicas de Google). */
  jwks?: JWTVerifyGetKey;
}

export interface GoogleIdentity {
  subject: string;
  email?: string;
  name?: string;
}

export interface PendingSignIn {
  codeVerifier: string;
  nonce: string;
}

export class GoogleOidc {
  private readonly fetchImpl: typeof fetch;
  private readonly jwks: JWTVerifyGetKey;

  constructor(private readonly options: GoogleOidcOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.jwks = options.jwks ?? createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }

  /** URL de autorización y lo que hay que guardar (servidor) hasta la vuelta. */
  /**
   * Con `books`, el mismo consentimiento pide también Google Books (acceso continuado): es el alta, el único momento
   * en que se piden permisos. Google deja a la persona desmarcarlo (consentimiento granular).
   */
  start(state: string, options: { books?: boolean; calendar?: boolean } = {}): { url: string; pending: PendingSignIn } {
    const codeVerifier = randomBytes(48).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', this.options.redirectUri);
    url.searchParams.set('response_type', 'code');
    const extra = [...(options.books ? [GOOGLE_BOOKS_SCOPE] : []), ...(options.calendar ? [GOOGLE_CALENDAR_SCOPE] : [])];
    url.searchParams.set('scope', ['openid', 'email', 'profile', ...extra].join(' '));
    if (extra.length) url.searchParams.set('access_type', 'offline');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', createHash('sha256').update(codeVerifier).digest('base64url'));
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.toString(), pending: { codeVerifier, nonce } };
  }

  /** Canjea el código y verifica el ID token. Lanza si algo no cuadra. */
  async complete(code: string, pending: PendingSignIn): Promise<GoogleIdentity & { tokens: GoogleSignInTokens }> {
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code,
        code_verifier: pending.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: this.options.redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Google rechazó el código (HTTP ${response.status})`);
    const { id_token, ...tokens } = tokenSchema.parse(await response.json());
    return { ...(await this.verifyIdToken(id_token, pending.nonce)), tokens };
  }

  async verifyIdToken(idToken: string, nonce: string): Promise<GoogleIdentity> {
    const { payload } = await jwtVerify(idToken, this.jwks, { issuer: GOOGLE_ISSUERS, audience: this.options.clientId, algorithms: ['RS256'] });
    if (payload.nonce !== nonce) throw new Error('El nonce del ID token no coincide');
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('ID token sin sujeto');
    const email = payload.email_verified === true && typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
    const name = typeof payload.given_name === 'string' ? payload.given_name : typeof payload.name === 'string' ? payload.name : undefined;
    return { subject: payload.sub, ...(email ? { email } : {}), ...(name ? { name } : {}) };
  }
}

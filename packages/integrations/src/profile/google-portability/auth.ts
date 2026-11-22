import { SourceError, type AuthResult, type CompleteConnectContext, type ConnectContext } from '@appinity/shared';
import { createPkce, scopesToGroups, type GooglePortabilityClient } from './client.js';
import { PORTABILITY_SCOPE_PREFIX, type ResourceGroup } from './constants.js';

/** La URL de vuelta apunta a este equipo: el consentimiento debe hacerse en su navegador (desarrollo). */
export function isLocalRedirect(redirectUri: string): boolean {
  try {
    const host = new URL(redirectUri).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Paso 1: consentimiento de Google con solo los scopes de Data Portability de los grupos que se importan. El usuario
 * elige ahí los datos y la duración (una vez, 30 o 180 días). El verificador PKCE viaja en `pending` (Redis, con el
 * `state`), nunca al cliente.
 */
export function startPortabilityConnect(
  client: GooglePortabilityClient,
  groups: readonly ResourceGroup[],
  context: ConnectContext,
): AuthResult {
  if (!context.state) throw new SourceError('not_configured', 'Falta el state del flujo de autorización', false);
  const pkce = createPkce();
  return {
    kind: 'redirect',
    url: client.authorizationUrl({ state: context.state, codeChallenge: pkce.challenge, groups }),
    state: context.state,
    pending: { codeVerifier: pkce.verifier },
    ...(isLocalRedirect(client.redirectUri) ? { localOnly: true } : {}),
  };
}

/**
 * Paso 2: vuelta de Google. Se canjea el código (con PKCE) por un refresh token, se comprueba qué grupos concedió de
 * verdad el usuario (puede desmarcar algunos) y qué tipo de acceso eligió. Sin identidad de cuenta: Google no permite
 * mezclar estos scopes con openid/email.
 */
export async function completePortabilityConnect(
  client: GooglePortabilityClient,
  requested: readonly ResourceGroup[],
  context: CompleteConnectContext,
): Promise<AuthResult> {
  const params = context.callbackParams;
  if (params.error) {
    throw new SourceError(
      'verification_failed',
      params.error === 'access_denied' ? 'Se canceló la autorización en Google' : `Google no concedió el acceso (${params.error.slice(0, 60)})`,
      false,
    );
  }
  const verifier = context.pending?.codeVerifier;
  if (!params.code || !verifier) throw new SourceError('verification_failed', 'Respuesta de Google incompleta: vuelve a intentarlo', false);

  const token = await client.exchangeCode(params.code, verifier);
  if (!token.refresh_token) {
    throw new SourceError('verification_failed', 'Google no entregó un acceso continuado: vuelve a autorizar', false);
  }
  const granted = scopesToGroups(token.scope).filter((g): g is ResourceGroup => (requested as readonly string[]).includes(g));
  if (!granted.length) {
    await client.revoke(token.refresh_token).catch(() => undefined);
    throw new SourceError('verification_failed', 'No marcaste ningún dato en Google: vuelve a conectar y elige al menos uno', false);
  }
  const access = await client.accessType(token.access_token);
  const expiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
    : undefined;
  return {
    kind: 'connected',
    credentials: {
      refreshToken: token.refresh_token,
      groups: JSON.stringify(granted),
      oneTime: JSON.stringify(access.oneTime),
      jobs: '{}',
      exportedAt: '{}',
      ...(expiresAt ? { accessExpiresAt: expiresAt } : {}),
    },
    scopes: granted.map((g) => `${PORTABILITY_SCOPE_PREFIX}${g}`),
  };
}

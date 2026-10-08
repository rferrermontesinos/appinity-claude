import { SourceError, type AuthResult, type CompleteConnectContext, type ConnectContext } from '@appinity/shared';
import type { TmdbClient } from '../../tmdb/client.js';
import { tmdbAuthorizeUrl } from '../../tmdb/constants.js';

/** Datos de la cuenta que se piden en el consentimiento (lectura de listas; APPINITY nunca escribe en TMDb). */
export const TMDB_SCOPES = ['tmdb:session', 'account:rated', 'account:favorite', 'account:watchlist'];

/**
 * Paso 1 (autorización del usuario): pide un request token con el token de la aplicación y envía al usuario a
 * themoviedb.org para que lo apruebe. El token viaja en `pending`, guardado por la API junto al `state`, y se
 * comprueba en la vuelta: así una vuelta con otro token no puede colarse en este flujo.
 */
export async function startTmdbConnect(client: TmdbClient, context: ConnectContext): Promise<AuthResult> {
  if (!context.redirectUri) throw new SourceError('not_configured', 'Falta la URL de retorno para autorizar TMDb', false);
  const requestToken = await client.createRequestToken();
  return { kind: 'redirect', url: tmdbAuthorizeUrl(requestToken, context.redirectUri), state: '', pending: { requestToken } };
}

/**
 * Paso 2: la vuelta de themoviedb.org. Se rechaza si el usuario denegó el acceso o si el token no coincide con el
 * del flujo; después se crea la sesión (TMDb solo la emite si el token fue aprobado) y se identifica la cuenta.
 * El `session_id` se trata como una contraseña: solo se devuelve como credencial para guardarla cifrada.
 */
export async function completeTmdbConnect(client: TmdbClient, context: CompleteConnectContext): Promise<AuthResult> {
  const requestToken = context.pending?.requestToken;
  if (!requestToken) throw new SourceError('verification_failed', 'La solicitud de autorización de TMDb no es válida', false);
  const params = context.callbackParams;
  if (params.denied === 'true') throw new SourceError('verification_failed', 'Se denegó el acceso en TMDb', false);
  if (params.request_token !== undefined && params.request_token !== requestToken) {
    throw new SourceError('verification_failed', 'La respuesta de TMDb no corresponde a esta solicitud', false);
  }

  const sessionId = await client.createSession(requestToken);
  let account: { id: number };
  try {
    account = await client.getAccount(sessionId);
  } catch (error) {
    // Sin cuenta identificada no se guarda nada: se invalida la sesión recién creada.
    await client.deleteSession(sessionId).catch(() => undefined);
    throw error;
  }
  return { kind: 'connected', externalAccountRef: String(account.id), credentials: { sessionId }, scopes: TMDB_SCOPES };
}

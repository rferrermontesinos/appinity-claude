import { SourceError } from '@appinity/shared';
import {
  OPENID_IDENTIFIER_SELECT,
  OPENID_MAX_NONCE_AGE_MS,
  OPENID_NS,
  OPENID_REQUIRED_SIGNED,
  STEAM_CLAIMED_ID_PATTERN,
  STEAM_OPENID_ENDPOINT,
} from './constants.js';
import { openIdCallbackSchema } from './schemas.js';

/**
 * URL de inicio de sesión con Steam (OpenID 2.0, checkid_setup con identifier_select). El usuario introduce su
 * contraseña en steamcommunity.com, nunca en APPINITY. `returnTo` debe estar dentro de `realm`.
 */
export function buildSteamOpenIdUrl(options: { returnTo: string; realm: string }): string {
  if (!options.returnTo.startsWith(options.realm)) throw new Error('return_to debe estar dentro del realm');
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.searchParams.set('openid.ns', OPENID_NS);
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', options.returnTo);
  url.searchParams.set('openid.realm', options.realm);
  url.searchParams.set('openid.identity', OPENID_IDENTIFIER_SELECT);
  url.searchParams.set('openid.claimed_id', OPENID_IDENTIFIER_SELECT);
  return url.toString();
}

function nonceAge(nonce: string, now: number): number | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(nonce);
  if (!match) return null;
  return now - Date.parse(match[1]!);
}

/**
 * Verifica la respuesta OpenID de Steam y devuelve el SteamID64 (como texto). Comprueba modo, endpoint, que
 * `return_to` sea exactamente el esperado (incluye el `state` de un solo uso), el formato del Claimed ID, los campos
 * firmados y la antigüedad del nonce, y confirma la firma con Steam (check_authentication).
 */
export async function verifySteamOpenId(
  params: Record<string, string>,
  expectedReturnTo: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string> {
  const parsed = openIdCallbackSchema.safeParse(params);
  if (!parsed.success) throw new SourceError('verification_failed', 'Respuesta de Steam incompleta', false);
  const p = parsed.data;
  if (p['openid.mode'] === 'cancel') {
    throw new SourceError('verification_failed', 'Se canceló el inicio de sesión en Steam', false);
  }
  const fail = (reason: string) => new SourceError('verification_failed', `No se pudo verificar la respuesta de Steam: ${reason}`, false);
  if (p['openid.ns'] !== OPENID_NS || p['openid.mode'] !== 'id_res') throw fail('modo o versión OpenID inesperados');
  if (p['openid.op_endpoint'] !== STEAM_OPENID_ENDPOINT) throw fail('el proveedor no es Steam');
  if (p['openid.return_to'] !== expectedReturnTo) throw fail('la URL de retorno no coincide');
  const claimed = p['openid.claimed_id'] ?? '';
  const match = STEAM_CLAIMED_ID_PATTERN.exec(claimed);
  if (!match || p['openid.identity'] !== claimed) throw fail('identificador de Steam no válido');
  const signed = (p['openid.signed'] ?? '').split(',');
  if (!OPENID_REQUIRED_SIGNED.every((field) => signed.includes(field)) || !p['openid.sig']) {
    throw fail('faltan campos firmados');
  }
  const age = nonceAge(p['openid.response_nonce'] ?? '', now);
  if (age === null || age > OPENID_MAX_NONCE_AGE_MS || age < -OPENID_MAX_NONCE_AGE_MS) throw fail('respuesta caducada');

  // Confirmación directa con Steam: reenvía los parámetros recibidos con mode=check_authentication.
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  let text: string;
  try {
    const response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    text = await response.text();
  } catch {
    throw new SourceError('unavailable', 'No se pudo confirmar el inicio de sesión con Steam; inténtalo de nuevo', true);
  }
  if (!/^is_valid:true$/m.test(text)) throw fail('Steam no confirma la firma');
  return match[1]!;
}

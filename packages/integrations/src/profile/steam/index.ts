import { SourceError, type ProfileSourceAdapter } from '@appinity/shared';
import { buildSteamOpenIdUrl, verifySteamOpenId } from './auth.js';
import { SteamClient, type SteamClientOptions } from './client.js';
import { STEAM_MANIFEST } from './manifest.js';
import { mapSteamGame } from './mapper.js';
import { syncSteam } from './sync.js';

export { STEAM_MANIFEST } from './manifest.js';
export { SteamClient } from './client.js';
export { buildSteamOpenIdUrl, verifySteamOpenId } from './auth.js';
export { mapSteamGame } from './mapper.js';
export { syncSteam } from './sync.js';
export * from './constants.js';

export interface SteamAdapterOptions extends SteamClientOptions {
  /** fetch para la verificación OpenID (inyectable en tests). */
  openIdFetch?: typeof fetch;
}

/**
 * Adapter de Steam. Conectar = OpenID (identidad); sincronizar = Web API con la clave del servidor. No hay token
 * de usuario que guardar ni revocar: la conexión solo conserva el SteamID mientras está activa.
 */
export function createSteamAdapter(options: SteamAdapterOptions): ProfileSourceAdapter {
  const client = new SteamClient(options);
  const openIdFetch = options.openIdFetch ?? options.fetchImpl ?? fetch;
  return {
    manifest: STEAM_MANIFEST,
    snapshotObservationKinds: ['library'],
    async connect(context) {
      if (!context.redirectUri || !context.realm) {
        throw new SourceError('not_configured', 'Falta la URL de retorno para iniciar sesión con Steam', false);
      }
      return { kind: 'redirect', url: buildSteamOpenIdUrl({ returnTo: context.redirectUri, realm: context.realm }), state: '' };
    },
    async completeConnect(context) {
      const steamid = await verifySteamOpenId(context.callbackParams, context.redirectUri, openIdFetch);
      return {
        kind: 'connected',
        externalAccountRef: steamid,
        // OpenID no tiene scopes: se registra qué datos se leerán con la Web API.
        scopes: ['openid:steamid', 'webapi:GetPlayerSummaries', 'webapi:GetOwnedGames'],
      };
    },
    sync: (context) => syncSteam(client, context),
    normalize: async (record, context) => mapSteamGame(record, context),
    // OpenID no deja ningún token: no hay nada que revocar en Steam.
    disconnect: async () => undefined,
  };
}

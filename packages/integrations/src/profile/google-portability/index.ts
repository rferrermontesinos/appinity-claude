import type { EntityIdentifier, ProfileSourceAdapter } from '@appinity/shared';
import type { ArchiveSummary } from './archive.js';
import { completePortabilityConnect, startPortabilityConnect } from './auth.js';
import { GooglePortabilityClient, type GoogleClientOptions } from './client.js';
import { ALL_RESOURCE_GROUPS, OBSERVATION_KIND, PORTABILITY_SCOPE_PREFIX, isResourceGroup, type ResourceGroup } from './constants.js';
import { GOOGLE_PORTABILITY_MANIFEST } from './manifest.js';
import { mapGoogleRecord } from './mapper.js';
import { accessTokenFor, syncPortability } from './sync.js';

export { GOOGLE_PORTABILITY_MANIFEST } from './manifest.js';
export { GooglePortabilityClient, ExportLimitError, createPkce, scopesToGroups } from './client.js';
export { readArchive, extractRecords, parseStars, urlPattern, type ArchiveSummary } from './archive.js';
export { syncPortability, readState, recordIdOf, accessTokenFor } from './sync.js';
export { mapGoogleRecord } from './mapper.js';
export { isLocalRedirect } from './auth.js';
export * from './constants.js';

export interface GooglePortabilityAdapterOptions extends GoogleClientOptions {
  /** Grupos a pedir; por defecto, los de las fases 3 y 4. Solo se piden los que se importan (scopes mínimos). */
  groups?: readonly string[];
  /** Identificación de lugares y obras en el catálogo (solo la necesita el worker). */
  identifier?: EntityIdentifier;
  onArchiveSummary?: (summary: ArchiveSummary) => void;
  onProgress?: (message: string) => void;
}

/**
 * Adapter de Google Data Portability. Un solo consentimiento OAuth (sin tokens a cargo del usuario); el refresh token
 * se guarda cifrado. Renovar la autorización reutiliza la conexión y conserva lo importado. Desconectar revoca en
 * Google todos los permisos de Data Portability concedidos a APPINITY.
 */
export function createGooglePortabilityAdapter(options: GooglePortabilityAdapterOptions): ProfileSourceAdapter {
  const client = new GooglePortabilityClient(options);
  const groups: ResourceGroup[] = (options.groups ?? ALL_RESOURCE_GROUPS).filter(isResourceGroup);
  return {
    manifest: GOOGLE_PORTABILITY_MANIFEST,
    supportsRenewal: true,
    // Exports ya pedidos (y su fecha): Google solo admite uno por grupo cada 24 h; se siguen esperando tras renovar.
    credentialsKeptOnRenewal: ['jobs', 'exportedAt'],
    requestedScopes: groups.map((g) => `${PORTABILITY_SCOPE_PREFIX}${g}`),
    snapshotObservationKinds: groups.map((g) => OBSERVATION_KIND[g]),
    connect: async (context) => startPortabilityConnect(client, groups, context),
    completeConnect: (context) => completePortabilityConnect(client, groups, context),
    sync: (context) => {
      if (!options.identifier) throw new Error('El adapter de Google necesita un identificador de catálogo para sincronizar');
      return syncPortability(client, context, {
        identifier: options.identifier,
        ...(options.onArchiveSummary ? { onArchiveSummary: options.onArchiveSummary } : {}),
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      });
    },
    normalize: async (record, context) => mapGoogleRecord(record, context),
    async releaseGrantBeforeRenewal(_connection, credentials) {
      if (!credentials) return;
      // Si el permiso ya caducó o se revocó, no queda nada que liberar.
      const accessToken = await accessTokenFor(client, credentials, new Date()).catch(() => null);
      if (accessToken) await client.reset(accessToken).catch(() => undefined);
      const token = credentials.refreshToken ?? accessToken;
      if (token) await client.revoke(token).catch(() => undefined);
    },
    async disconnect(_connection, credentials) {
      if (!credentials) return;
      // Revoca todos los permisos de Data Portability de APPINITY en esa cuenta y después el propio token.
      const accessToken = await accessTokenFor(client, credentials, new Date());
      if (!accessToken) return;
      await client.reset(accessToken);
      await client.revoke(credentials.refreshToken ?? accessToken).catch(() => undefined);
    },
  };
}

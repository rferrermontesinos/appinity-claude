import type { ProfileSourceAdapter } from '@appinity/shared';
import { completeTmdbConnect, startTmdbConnect } from './auth.js';
import { TmdbClient, type TmdbClientOptions } from '../../tmdb/client.js';
import { TMDB_MANIFEST } from './manifest.js';
import { mapTmdbRecord } from './mapper.js';
import { syncTmdb } from './sync.js';

export { TMDB_MANIFEST } from './manifest.js';
export { TmdbClient, type TmdbClientOptions } from '../../tmdb/client.js';
export { completeTmdbConnect, startTmdbConnect, TMDB_SCOPES } from './auth.js';
export { mapTmdbRecord } from './mapper.js';
export { syncTmdb } from './sync.js';
export * from './constants.js';

export type TmdbAdapterOptions = TmdbClientOptions;

/**
 * Adapter de TMDb. Dos autenticaciones separadas: el token de la APLICACIÓN (TMDB_API_READ_TOKEN, servidor) y la
 * sesión del USUARIO (`session_id`, cifrada por conexión). Desconectar borra la sesión también en TMDb.
 */
export function createTmdbAdapter(options: TmdbAdapterOptions): ProfileSourceAdapter {
  const client = new TmdbClient(options);
  return {
    manifest: TMDB_MANIFEST,
    snapshotObservationKinds: ['rating', 'favorite', 'watchlist'],
    connect: (context) => startTmdbConnect(client, context),
    completeConnect: (context) => completeTmdbConnect(client, context),
    sync: (context) => syncTmdb(client, context),
    normalize: async (record, context) => mapTmdbRecord(record, context),
    async disconnect(_connection, credentials) {
      if (credentials?.sessionId) await client.deleteSession(credentials.sessionId);
    },
  };
}

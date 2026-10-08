import type { ProfileSourceManifest } from '@appinity/shared';

/**
 * TMDb. Capacidades verificadas en la documentación oficial (2026-10-08): valoraciones explícitas (0,5–10),
 * favoritos y lista de pendientes de películas y series, sin fechas ni historial de visionado ni sync incremental.
 */
export const TMDB_MANIFEST: ProfileSourceManifest = {
  key: 'tmdb',
  name: 'TMDb',
  categories: ['movies', 'series'],
  authentication: 'provider-session',
  syncStrategy: 'full-refresh',
  capabilities: {
    known: true,
    consumed: true,
    explicitRating: true,
    implicitPreference: false,
    history: false,
    incrementalSync: false,
  },
  availability: 'available',
  simulated: false,
  description:
    'Autorizas a APPINITY en themoviedb.org. Se leen tus valoraciones, favoritos y pendientes de películas y series; nunca se escribe en tu cuenta.',
};

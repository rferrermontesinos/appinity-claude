import type { PlannedSourceKey, ProfileSourceManifest } from '@appinity/shared';

const NONE = { known: false, consumed: false, explicitRating: false, implicitPreference: false, history: false, incrementalSync: false };

/**
 * Fuentes reales previstas (Steam y TMDb ya están implementadas: ver profile/steam y profile/tmdb). Capacidades a false porque todavía no se ha verificado nada con su documentación
 * oficial ni con una conexión real. No son conectables hasta su fase.
 */
export const PLANNED_MANIFESTS: Array<ProfileSourceManifest & { plannedPhase: string }> = [
  {
    key: 'lastfm',
    name: 'Last.fm',
    categories: ['music'],
    authentication: 'api-key',
    syncStrategy: 'incremental',
    capabilities: NONE,
    availability: 'planned',
    simulated: false,
    description: 'Scrobbles, artistas y loved tracks (por verificar).',
    plannedPhase: '4',
  },
  {
    key: 'google_activity',
    name: 'Google',
    categories: ['food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts'],
    authentication: 'oauth2',
    syncStrategy: 'scheduled',
    capabilities: NONE,
    availability: 'planned',
    simulated: false,
    description: 'Data Portability y actividad (por verificar datasets y scopes).',
    plannedPhase: '11',
  },
  {
    key: 'apple_music',
    name: 'Apple Music',
    categories: ['music'],
    authentication: 'native-permission',
    syncStrategy: 'scheduled',
    capabilities: NONE,
    availability: 'planned',
    simulated: false,
    description: 'Biblioteca y favoritos (por verificar).',
    plannedPhase: '11',
  },
];

export function isPlannedSourceKey(key: string): key is PlannedSourceKey {
  return PLANNED_MANIFESTS.some((m) => m.key === key);
}

import type { PlannedSourceKey, ProfileSourceManifest } from '@appinity/shared';

const NONE = { known: false, consumed: false, explicitRating: false, implicitPreference: false, history: false, incrementalSync: false };

/**
 * Fuentes reales previstas según la revisión de fuentes del 2026-10-08 (especificación §9 y docs/fuentes-de-datos.md).
 * Steam ya está implementada (ver profile/steam). Capacidades a false porque todavía no se ha comprobado nada con una
 * conexión real. No son conectables hasta su fase. Las que exigen acuerdo comercial no se muestran.
 */
export const PLANNED_MANIFESTS: Array<ProfileSourceManifest & { plannedPhase: string }> = [
  {
    key: 'google_portability',
    name: 'Google',
    categories: ['food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts'],
    authentication: 'oauth2',
    syncStrategy: 'scheduled',
    capabilities: NONE,
    availability: 'planned',
    simulated: false,
    description:
      'Con una autorización de Google: valoraciones de la Búsqueda, reseñas y guardados de Maps, YouTube y YouTube Music (UE, Suiza y Reino Unido).',
    plannedPhase: '3–4',
  },
  {
    key: 'google_books',
    name: 'Google Books',
    categories: ['books'],
    authentication: 'oauth2',
    syncStrategy: 'scheduled',
    capabilities: NONE,
    availability: 'planned',
    simulated: false,
    description: 'Estanterías: leídos, favoritos, por leer y reseñados.',
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
    description: 'Biblioteca, valoraciones y escuchas recientes (MusicKit).',
    plannedPhase: '11',
  },
  {
    key: 'device_calendar',
    name: 'Calendario',
    categories: ['food', 'culture'],
    authentication: 'native-permission',
    syncStrategy: 'scheduled',
    capabilities: NONE,
    availability: 'planned',
    simulated: false,
    description: 'Eventos previstos del calendario del teléfono, filtrados en el dispositivo.',
    plannedPhase: '11',
  },
];

export function isPlannedSourceKey(key: string): key is PlannedSourceKey {
  return PLANNED_MANIFESTS.some((m) => m.key === key);
}

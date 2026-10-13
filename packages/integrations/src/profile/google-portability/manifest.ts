import type { ProfileSourceManifest } from '@appinity/shared';

/**
 * Google Data Portability (fase 3: valoraciones y lugares). Capacidades verificadas en la documentación oficial
 * (2026-10-09). Los registros traen fecha, pero cada export es una instantánea del estado actual, no un historial de
 * eventos; no hay sync incremental para estos grupos.
 */
export const GOOGLE_PORTABILITY_MANIFEST: ProfileSourceManifest = {
  key: 'google_portability',
  name: 'Google',
  categories: ['food', 'culture', 'movies', 'series', 'books', 'music', 'games'],
  authentication: 'oauth2',
  syncStrategy: 'scheduled',
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
    'Una autorización de Google: tus reseñas y sitios guardados de Maps y lo que valoras o marcas como visto en la Búsqueda. Solo lectura; disponible en la UE, Suiza y Reino Unido.',
};

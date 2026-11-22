import type { ProfileSourceManifest } from '@appinity/shared';

/**
 * Google Data Portability (fases 3, 4 y 11: valoraciones y lugares, YouTube, Google Play, pedidos y guardados). Capacidades verificadas en la documentación oficial
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
    implicitPreference: true,
    history: false,
    incrementalSync: false,
  },
  availability: 'available',
  simulated: false,
  description:
    'Una sola autorización de Google: reseñas y sitios guardados de Maps, lo que valoras o marcas como visto en la Búsqueda, lo que escuchas y sigues en YouTube y YouTube Music, tu biblioteca de Google Play (libros, juegos, películas y series), tus pedidos y reservas de comida y tus colecciones guardadas. Solo lectura; disponible en la UE, Suiza y Reino Unido.',
};

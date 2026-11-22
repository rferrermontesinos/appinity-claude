import type { FixtureSourceKey, ProfileSourceManifest } from '@appinity/shared';

/**
 * Fuentes SIMULADAS de la demo. Cada una imita una clase de evidencia de las fuentes reales previstas, sin
 * llamar a ningún proveedor y sin simular OAuth (`authentication: 'fixture'`).
 */
export const FIXTURE_MANIFESTS: Record<FixtureSourceKey, ProfileSourceManifest> = {
  fixture_screen: {
    key: 'fixture_screen',
    name: 'Demo · Cine y series',
    categories: ['movies', 'series'],
    authentication: 'fixture',
    syncStrategy: 'incremental',
    capabilities: { known: true, consumed: true, explicitRating: true, implicitPreference: false, history: true, incrementalSync: true },
    availability: 'fixture',
    simulated: true,
    description: 'Simulada. Valoraciones 1–10, lista de pendientes y vistos sin valoración (clase de evidencia tipo TMDb).',
  },
  fixture_diary: {
    key: 'fixture_diary',
    name: 'Demo · Diario de películas y libros',
    categories: ['movies', 'books'],
    authentication: 'fixture',
    syncStrategy: 'incremental',
    capabilities: { known: true, consumed: true, explicitRating: true, implicitPreference: false, history: true, incrementalSync: true },
    availability: 'fixture',
    simulated: true,
    description: 'Simulada. Estrellas de 0,5 a 5, «quiero ver/leer», registros sin nota, ISBN de ediciones y fechas solo con año.',
  },
  fixture_activity: {
    key: 'fixture_activity',
    name: 'Demo · Actividad y lugares',
    categories: ['food', 'culture', 'movies'],
    authentication: 'fixture',
    syncStrategy: 'incremental',
    capabilities: { known: true, consumed: true, explicitRating: true, implicitPreference: true, history: true, incrementalSync: true },
    availability: 'fixture',
    simulated: true,
    description:
      'Simulada. Lugares guardados, reseñas 1–5, visitas inferidas, asistencia confirmada, eventos de calendario y pulgares (clase de evidencia tipo Google).',
  },
  fixture_play: {
    key: 'fixture_play',
    name: 'Demo · Biblioteca de juegos',
    categories: ['games'],
    authentication: 'fixture',
    syncStrategy: 'full-refresh',
    capabilities: { known: true, consumed: true, explicitRating: false, implicitPreference: true, history: false, incrementalSync: false },
    availability: 'fixture',
    simulated: true,
    description: 'Simulada. Instantánea de biblioteca con horas jugadas, incluidos juegos con 0 horas (clase de evidencia tipo Steam).',
  },
  fixture_audio: {
    key: 'fixture_audio',
    name: 'Demo · Música y podcasts',
    categories: ['music', 'podcasts'],
    authentication: 'fixture',
    syncStrategy: 'full-refresh',
    capabilities: { known: true, consumed: true, explicitRating: false, implicitPreference: true, history: true, incrementalSync: false },
    availability: 'fixture',
    simulated: true,
    description:
      'Simulada. Escuchas por artista, canciones favoritas agregadas al artista y episodios agregados por programa (clase de evidencia tipo Last.fm).',
  },
};

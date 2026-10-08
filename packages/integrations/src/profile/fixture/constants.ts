/**
 * Parámetros de los mappers fixture. Son PROPUESTAS sin calibrar (docs/decisions.md). Las fuentes reales
 * tendrán sus propias constantes, documentadas con su API oficial.
 */
export const FIXTURE_MAPPER_VERSIONS = {
  fixture_screen: 'fixture-screen-v1',
  fixture_diary: 'fixture-diary-v1',
  fixture_activity: 'fixture-activity-v1',
  fixture_play: 'fixture-play-v1',
  fixture_audio: 'fixture-audio-v1',
} as const;

/** Una valoración explícita es la evidencia más fiable de gusto. */
export const EXPLICIT_RATING_CONFIDENCE = 1;

/** Pulgar arriba/abajo: like/dislike explícito, menos graduado que una nota. */
export const THUMBS_SCORE = 0.8;
export const THUMBS_CONFIDENCE = 0.9;

/** Visita a un lugar con evidencia suficiente: +1 por regla de producto, con confianza moderada. */
export const VISIT_CONFIDENCE = 0.6;
/** Asistencia confirmada a un evento cultural: +1 por regla de producto. */
export const ATTENDANCE_CONFIDENCE = 0.7;
/** Evento previsto en calendario: conocimiento aproximado, sin consumo ni preferencia. */
export const PLANNED_EVENT_KNOWN = 0.8;

/** Juegos: por debajo de 2 h hay consumo, pero no preferencia. */
export const PLAY_MIN_HOURS_FOR_PREFERENCE = 2;
export const PLAY_PREFERENCE_CONFIDENCE = 0.6;

/** Música: una escucha aislada confirma consumo, no gusto. */
export const AUDIO_MIN_PLAYS_FOR_PREFERENCE = 3;
export const AUDIO_PREFERENCE_CONFIDENCE = 0.6;
/** Canción favorita agregada al artista: señal explícita sobre una parte de su obra. */
export const LOVED_TRACK_SCORE = 0.6;
export const LOVED_TRACK_CONFIDENCE = 0.7;

/** Podcasts: los episodios se agregan por programa. */
export const PODCAST_MIN_EPISODES_FOR_PREFERENCE = 3;
export const PODCAST_PREFERENCE_CONFIDENCE = 0.5;

/** Tamaño de página simulado para comprobar paginación y cursores. */
export const FIXTURE_PAGE_SIZE = 4;

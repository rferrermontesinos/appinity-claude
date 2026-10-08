import { playtimePreference } from '@appinity/algorithms';
import type { NormalizeContext, NormalizedObservation } from '@appinity/shared';
import {
  STEAM_MAPPER_VERSION,
  STEAM_MIN_HOURS_FOR_PREFERENCE,
  STEAM_PREFERENCE_CONFIDENCE,
  STEAM_TERMS_URL,
  steamCapsuleUrl,
} from './constants.js';
import { steamGameSchema } from './schemas.js';

/**
 * Juego de la biblioteca de Steam → observación (§5 y §9):
 * - 0 minutos: conocido 1, consumido 0, preferencia NULL (comprado no es consumido).
 * - Menos de 2 h: consumido 1, preferencia NULL (probarlo no demuestra gusto).
 * - Desde 2 h: preferencia positiva inferida `min(1, log1p(h) / log1p(p95 del usuario))`, confianza 0,6.
 * Las horas son una instantánea acumulada: una sola observación por juego que se actualiza en cada sync.
 */
export function mapSteamGame(raw: unknown, context: NormalizeContext): NormalizedObservation[] {
  const game = steamGameSchema.parse(raw);
  const hours = game.playtime_forever / 60;
  const recordId = `app:${game.appid}`;
  const title = game.name ?? `Steam app ${game.appid}`;
  const score =
    game.playtime_forever === 0
      ? null
      : playtimePreference(hours, context.stats?.playtimeP95Hours ?? null, STEAM_MIN_HOURS_FOR_PREFERENCE);
  const lastPlayed = game.rtime_last_played ? new Date(game.rtime_last_played * 1000).toISOString() : null;

  return [
    {
      userId: context.userId,
      source: 'steam',
      sourceRecordId: recordId,
      observationKind: 'library',
      mapperVersion: STEAM_MAPPER_VERSION,
      category: 'games',
      externalItem: {
        sourceId: recordId,
        itemType: 'game',
        title,
        canonicalIds: { 'steam:app': String(game.appid) },
        // Solo referencia: el arte de Steam no se copia a nuestro almacenamiento.
        imageCandidate: {
          url: steamCapsuleUrl(game.appid),
          source: 'steam_cdn',
          sourceImageId: `library_600x900:${game.appid}`,
          width: 600,
          height: 900,
          alt: title,
          rightsOrPolicyReference: STEAM_TERMS_URL,
          isFallback: false,
        },
      },
      ...(lastPlayed ? { occurredAt: lastPlayed, timestampPrecision: 'instant' as const } : {}),
      knownConfidence: 1,
      consumedConfidence: game.playtime_forever > 0 ? 1 : 0,
      preferenceScore: score,
      preferenceConfidence: score === null ? null : STEAM_PREFERENCE_CONFIDENCE,
      preferenceBasis: score === null ? null : 'strong_behavior',
      engagement:
        game.playtime_forever === 0
          ? { type: 'owned', value: 0, unit: 'hours' }
          : { type: 'played', value: Math.round(hours * 10) / 10, unit: 'hours' },
      metadata: {
        snapshot: true,
        playtimeForeverMinutes: game.playtime_forever,
        playtime2WeeksMinutes: game.playtime_2weeks ?? 0,
        ...(game.name ? {} : { nameUnavailable: true }),
      },
    },
  ];
}

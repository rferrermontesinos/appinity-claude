import { percentile } from '@appinity/algorithms';
import { SourceError, type SyncBatch, type SyncContext, type SyncPartialError } from '@appinity/shared';
import type { SteamClient } from './client.js';
import { STEAMID64_PATTERN, STEAM_VISIBILITY_PUBLIC } from './constants.js';
import { steamGameSchema, type SteamGame } from './schemas.js';

/**
 * Sync de Steam: instantánea completa de la biblioteca (GetOwnedGames no tiene historial ni paginación). Se
 * consulta solo la cuenta vinculada por el propio usuario (Terms of Use: "only retrieve Steam Data … as requested
 * by the end user"). Si la biblioteca no es visible, el sync falla con un mensaje accionable y NO borra evidencia.
 */
export async function syncSteam(client: SteamClient, context: SyncContext): Promise<SyncBatch> {
  const steamid = context.connection.externalAccountRef ?? '';
  if (!STEAMID64_PATTERN.test(steamid)) {
    throw new SourceError('verification_failed', 'La conexión no tiene un SteamID válido: vuelve a conectar Steam', false);
  }

  const visibility = await client.getPlayerVisibility(steamid);
  if (visibility === null) {
    throw new SourceError('profile_inaccessible', 'Steam no encuentra esta cuenta: vuelve a conectar Steam', false);
  }
  const owned = await client.getOwnedGames(steamid);
  if (!owned) {
    throw new SourceError(
      'profile_inaccessible',
      visibility === STEAM_VISIBILITY_PUBLIC
        ? 'Steam no muestra tu biblioteca: en Steam → Perfil → Editar perfil → Privacidad, pon «Detalles de juegos» en Público y vuelve a sincronizar'
        : 'Tu perfil de Steam no es público para esta clave: pon «Mi perfil» y «Detalles de juegos» en Público y vuelve a sincronizar',
      false,
    );
  }

  const records: SteamGame[] = [];
  const partialErrors: SyncPartialError[] = [];
  for (const raw of owned.games) {
    const game = steamGameSchema.safeParse(raw);
    if (game.success) records.push(game.data);
    else {
      const appid = (raw as { appid?: unknown })?.appid;
      partialErrors.push({
        ...(appid !== undefined ? { sourceRecordId: `app:${String(appid)}` } : {}),
        code: 'invalid_record',
        message: 'Entrada de juego con formato inesperado',
      });
    }
  }

  const playedHours = records.filter((g) => g.playtime_forever > 0).map((g) => g.playtime_forever / 60);
  const p95 = percentile(playedHours, 0.95);
  const lastPlayed = Math.max(0, ...records.map((g) => g.rtime_last_played ?? 0));
  return {
    records,
    cursor: null,
    hasMore: false,
    partialErrors,
    snapshotComplete: true,
    ...(lastPlayed > 0 ? { watermarkAt: new Date(lastPlayed * 1000).toISOString() } : {}),
    stats: { ...(p95 !== null ? { playtimeP95Hours: p95 } : {}), libraryGameCount: owned.gameCount, visibility },
  };
}

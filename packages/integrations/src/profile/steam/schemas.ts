import { z } from 'zod';

/** ISteamUser/GetPlayerSummaries/v2: solo los campos que usamos. */
export const playerSummariesSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({
        steamid: z.string(),
        communityvisibilitystate: z.number().int(),
        profilestate: z.number().int().optional(),
      }),
    ),
  }),
});

/**
 * IPlayerService/GetOwnedGames/v1. Si la biblioteca no es visible para la clave usada, Steam devuelve
 * `{"response":{}}`: sin `game_count` no hay datos (no es una biblioteca vacía).
 */
export const ownedGamesSchema = z.object({
  response: z.object({
    game_count: z.number().int().min(0).optional(),
    games: z.array(z.unknown()).optional(),
  }),
});

/** Entrada de juego de GetOwnedGames con `include_appinfo=1`. Minutos acumulados (instantánea). */
export const steamGameSchema = z.object({
  appid: z.number().int().positive(),
  name: z.string().min(1).optional(),
  playtime_forever: z.number().int().min(0),
  playtime_2weeks: z.number().int().min(0).optional(),
  rtime_last_played: z.number().int().min(0).optional(),
  img_icon_url: z.string().optional(),
});
export type SteamGame = z.infer<typeof steamGameSchema>;

/** Parámetros OpenID con los que Steam vuelve al callback de la API. */
export const openIdCallbackSchema = z.object({
  'openid.ns': z.string(),
  'openid.mode': z.string(),
  'openid.op_endpoint': z.string().optional(),
  'openid.claimed_id': z.string().optional(),
  'openid.identity': z.string().optional(),
  'openid.return_to': z.string().optional(),
  'openid.response_nonce': z.string().optional(),
  'openid.assoc_handle': z.string().optional(),
  'openid.signed': z.string().optional(),
  'openid.sig': z.string().optional(),
});

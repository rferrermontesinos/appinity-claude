/**
 * Respuestas SIMULADAS de la Steam Web API y de Steam OpenID con el formato documentado. Sirven para tests y para
 * usuarios simulados; no proceden de ninguna cuenta real.
 *
 * Los SteamID usados (7656119000000000x) están por debajo del primer SteamID64 de cuenta individual
 * (76561197960265728), así que no pueden corresponder a ninguna persona.
 */
export const SIMULATED_STEAM_IDS = {
  publicLibrary: '76561190000000001',
  privateProfile: '76561190000000002',
  hiddenGameDetails: '76561190000000003',
  emptyLibrary: '76561190000000004',
} as const;

/** Biblioteca simulada: appids y nombres reales, minutos inventados (incluye 0 min y una entrada corrupta). */
export const OWNED_GAMES_PUBLIC = {
  response: {
    game_count: 7,
    games: [
      { appid: 1127400, name: 'Mindustry', playtime_forever: 0, img_icon_url: 'simulated', rtime_last_played: 0 },
      { appid: 413150, name: 'Stardew Valley', playtime_forever: 0, rtime_last_played: 0 },
      { appid: 367520, name: 'Hollow Knight', playtime_forever: 45, rtime_last_played: 1771113600 },
      { appid: 1145360, name: 'Hades', playtime_forever: 4200, playtime_2weeks: 310, rtime_last_played: 1788912000 },
      { appid: 620, name: 'Portal 2', playtime_forever: 900, rtime_last_played: 1760313600 },
      { appid: 730, name: 'Counter-Strike 2', playtime_forever: 30000, playtime_2weeks: 600, rtime_last_played: 1789257600 },
      { appid: 'corrupto', name: 'Entrada con formato inesperado', playtime_forever: -1 },
    ],
  },
};

/** Biblioteca sin la entrada corrupta y sin Counter-Strike 2 (para comprobar instantáneas). */
export const OWNED_GAMES_WITHOUT_CS2 = {
  response: {
    game_count: 5,
    games: OWNED_GAMES_PUBLIC.response.games.filter((g) => g.appid !== 730 && typeof g.appid === 'number'),
  },
};

/** Lo que Steam devuelve cuando la biblioteca no es visible para la clave usada. */
export const OWNED_GAMES_HIDDEN = { response: {} };

export const OWNED_GAMES_EMPTY = { response: { game_count: 0 } };

export function playerSummary(steamid: string, visibility: 1 | 3) {
  return { response: { players: [{ steamid, communityvisibilitystate: visibility, profilestate: 1, personaname: 'Simulado' }] } };
}

/** Parámetros de vuelta OpenID simulados (la firma se valida contra un check_authentication simulado). */
export function openIdCallbackParams(returnTo: string, steamid: string, nonceDate = new Date()) {
  const claimed = `https://steamcommunity.com/openid/id/${steamid}`;
  return {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': returnTo,
    'openid.response_nonce': `${nonceDate.toISOString().slice(0, 19)}Zsimulated`,
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2ltdWxhdGVk',
  };
}

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export interface FakeSteamOptions {
  /** Respuestas por SteamID; por defecto, la biblioteca pública. */
  owned?: Record<string, unknown>;
  visibility?: Record<string, 1 | 3>;
  /** Respuestas HTTP previas a la buena (p. ej. [429, 500]) para simular límites y fallos transitorios. */
  failuresBeforeSuccess?: number[];
  /** Resultado de check_authentication de OpenID. */
  openIdValid?: boolean;
  /** Estado HTTP fijo (p. ej. 403 para clave no válida). */
  forceStatus?: number;
}

/**
 * fetch simulado de Steam: GetPlayerSummaries, GetOwnedGames y check_authentication. Registra las llamadas para
 * comprobar que la clave no viaja fuera de la petición a Steam.
 */
export function createFakeSteamFetch(options: FakeSteamOptions = {}) {
  const calls: string[] = [];
  const failures = [...(options.failuresBeforeSuccess ?? [])];
  const routes: Record<string, Route> = {
    '/ISteamUser/GetPlayerSummaries/v2/': (url) => {
      const id = url.searchParams.get('steamids') ?? '';
      const visibility = options.visibility?.[id] ?? 3;
      return json(id.startsWith('7656119') ? playerSummary(id, visibility) : { response: { players: [] } });
    },
    '/IPlayerService/GetOwnedGames/v1/': (url) => {
      const id = url.searchParams.get('steamid') ?? '';
      return json(options.owned?.[id] ?? OWNED_GAMES_PUBLIC);
    },
    '/openid/login': () =>
      new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${options.openIdValid === false ? 'false' : 'true'}\n`, {
        status: 200,
      }),
  };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(`${url.hostname}${url.pathname}`);
    if (options.forceStatus) return json({}, options.forceStatus);
    if (url.hostname === 'api.steampowered.com' && failures.length) {
      const status = failures.shift()!;
      return json({}, status, status === 429 ? { 'Retry-After': '0' } : {});
    }
    const route = routes[url.pathname];
    return route ? route(url, init) : json({}, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

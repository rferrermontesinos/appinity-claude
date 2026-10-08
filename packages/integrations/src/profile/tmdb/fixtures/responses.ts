/**
 * Respuestas SIMULADAS de la API v3 de TMDb con el formato documentado, para tests. No proceden de ninguna cuenta
 * real: la cuenta, las valoraciones, los favoritos, los pendientes, los tokens y las rutas de póster son inventados.
 * Los IDs de TMDb/IMDb/Wikidata y los títulos de las fichas son reales, salvo la «película simulada 1396», que
 * existe solo para comprobar que una película y una serie con el mismo número no se confunden.
 */
/** Con forma de JWT (como el «API Read Access Token» real) pero inventado: {"simulado":true}.simulado.no-es-real */
export const SIMULATED_TMDB_READ_TOKEN = 'eyJzaW11bGFkbyI6dHJ1ZX0.c2ltdWxhZG8.bm8tZXMtcmVhbA';
export const SIMULATED_TMDB_ACCOUNT_ID = 90000001;

type Media = 'movie' | 'tv';

interface FixtureDetails {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path: string | null;
  original_language: string;
  external_ids: { imdb_id: string | null; wikidata_id: string | null };
}

/** Fichas de catálogo (IDs y títulos reales; pósters simulados). */
export const TMDB_DETAILS: Record<string, FixtureDetails> = {
  'movie:603': {
    id: 603,
    title: 'Matrix',
    original_title: 'The Matrix',
    release_date: '1999-03-31',
    overview: 'Ficha simulada para tests.',
    poster_path: '/simulado-603.jpg',
    original_language: 'en',
    external_ids: { imdb_id: 'tt0133093', wikidata_id: 'Q83495' },
  },
  'movie:27205': {
    id: 27205,
    title: 'Origen',
    original_title: 'Inception',
    release_date: '2010-07-15',
    poster_path: '/simulado-27205.jpg',
    original_language: 'en',
    external_ids: { imdb_id: 'tt1375666', wikidata_id: 'Q25188' },
  },
  'movie:129': {
    id: 129,
    title: 'El viaje de Chihiro',
    original_title: '千と千尋の神隠し',
    release_date: '2001-07-20',
    poster_path: null,
    original_language: 'ja',
    external_ids: { imdb_id: 'tt0245429', wikidata_id: null },
  },
  'movie:1396': {
    id: 1396,
    title: 'Película simulada 1396',
    release_date: '2000-01-01',
    poster_path: null,
    original_language: 'es',
    external_ids: { imdb_id: null, wikidata_id: null },
  },
  'tv:1396': {
    id: 1396,
    name: 'Breaking Bad',
    original_name: 'Breaking Bad',
    first_air_date: '2008-01-20',
    poster_path: '/simulado-tv-1396.jpg',
    original_language: 'en',
    external_ids: { imdb_id: 'tt0903747', wikidata_id: 'Q1079' },
  },
  'tv:1399': {
    id: 1399,
    name: 'Juego de tronos',
    original_name: 'Game of Thrones',
    first_air_date: '2011-04-17',
    poster_path: '/simulado-tv-1399.jpg',
    original_language: 'en',
    external_ids: { imdb_id: 'tt0944947', wikidata_id: 'Q23572' },
  },
};

/** Elemento de lista tal como lo devuelve TMDb (sin IDs externos; `rating` solo en valoradas). */
export function listItem(key: keyof typeof TMDB_DETAILS & string, rating?: number) {
  const { external_ids: _ids, overview: _overview, ...item } = TMDB_DETAILS[key]!;
  return { ...item, ...(rating !== undefined ? { rating } : {}) };
}

export type TmdbFixtureLists = Record<
  'rated/movies' | 'rated/tv' | 'favorite/movies' | 'favorite/tv' | 'watchlist/movies' | 'watchlist/tv',
  unknown[]
>;

/** Listas simuladas: Matrix valorada (8,5) y favorita a la vez; serie y película con el mismo número 1396. */
export function defaultLists(): TmdbFixtureLists {
  return {
    'rated/movies': [listItem('movie:603', 8.5), listItem('movie:27205', 3), listItem('movie:1396', 0.5)],
    'rated/tv': [listItem('tv:1396', 10)],
    'favorite/movies': [listItem('movie:603')],
    'favorite/tv': [listItem('tv:1399')],
    'watchlist/movies': [listItem('movie:129')],
    'watchlist/tv': [],
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export interface FakeTmdbOptions {
  lists?: TmdbFixtureLists;
  /** Resultados por página (TMDb usa 20); bajarlo permite probar la paginación con pocas entradas. */
  pageSize?: number;
  /** Respuestas HTTP previas a la buena (p. ej. [429, 500]) para simular límites y fallos transitorios. */
  failuresBeforeSuccess?: number[];
  /** Si `/3/account` responde 404 (para probar la ruta alternativa documentada). */
  accountWithoutIdMissing?: boolean;
}

/**
 * fetch simulado de TMDb: request token, aprobación (`approve`), sesión, cuenta, listas paginadas, fichas, /find y
 * búsqueda. Exige el token de la aplicación en `Authorization` y valida `session_id` en las rutas de cuenta.
 */
export function createFakeTmdbFetch(options: FakeTmdbOptions = {}) {
  const lists = options.lists ?? defaultLists();
  const pageSize = options.pageSize ?? 20;
  const failures = [...(options.failuresBeforeSuccess ?? [])];
  const calls: Array<{ method: string; path: string; hasSession: boolean; authorization: string | null }> = [];
  const approved = new Set<string>();
  const sessions = new Set<string>();
  const deletedSessions: string[] = [];
  let tokenCounter = 0;
  let sessionCounter = 0;

  const unauthorized = (code: number) => json({ success: false, status_code: code, status_message: 'simulated' }, 401);

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const sessionId = url.searchParams.get('session_id');
    calls.push({ method, path: url.pathname, hasSession: sessionId !== null, authorization: headers.get('authorization') });
    if (failures.length) {
      const status = failures.shift()!;
      return json({}, status, status === 429 ? { 'Retry-After': '0' } : {});
    }
    if (headers.get('authorization') !== `Bearer ${SIMULATED_TMDB_READ_TOKEN}`) return unauthorized(7);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : {};
    const path = url.pathname;

    if (method === 'GET' && path === '/3/authentication/token/new') {
      tokenCounter += 1;
      return json({ success: true, expires_at: '2026-10-08 20:00:00 UTC', request_token: `simulated-request-token-${tokenCounter}` });
    }
    if (method === 'POST' && path === '/3/authentication/session/new') {
      if (!approved.has(body.request_token ?? '')) return unauthorized(17);
      approved.delete(body.request_token!);
      sessionCounter += 1;
      const id = `simulated-session-${sessionCounter}-0123456789abcdef`;
      sessions.add(id);
      return json({ success: true, session_id: id });
    }
    if (method === 'DELETE' && path === '/3/authentication/session') {
      const ok = sessions.delete(body.session_id ?? '');
      if (ok) deletedSessions.push(body.session_id!);
      return ok ? json({ success: true }) : json({ success: false, status_code: 6 }, 404);
    }

    const accountMatch = /^\/3\/account(?:\/(\d+))?(?:\/(rated|favorite|watchlist)\/(movies|tv))?$/.exec(path);
    if (method === 'GET' && accountMatch) {
      if (!sessionId || !sessions.has(sessionId)) return unauthorized(3);
      const [, accountId, kind, media] = accountMatch;
      if (!kind) {
        if (!accountId && options.accountWithoutIdMissing) return json({ success: false, status_code: 34 }, 404);
        return json({ id: SIMULATED_TMDB_ACCOUNT_ID, username: 'simulado', name: '', include_adult: false });
      }
      if (accountId !== String(SIMULATED_TMDB_ACCOUNT_ID)) return unauthorized(3);
      const all = lists[`${kind}/${media}` as keyof TmdbFixtureLists];
      const page = Number(url.searchParams.get('page') ?? '1');
      const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
      return json({
        page,
        results: all.slice((page - 1) * pageSize, page * pageSize),
        total_pages: totalPages,
        total_results: all.length,
      });
    }

    const detailsMatch = /^\/3\/(movie|tv)\/(\d+)$/.exec(path);
    if (method === 'GET' && detailsMatch) {
      const details = TMDB_DETAILS[`${detailsMatch[1]}:${detailsMatch[2]}`];
      return details ? json(details) : json({ success: false, status_code: 34 }, 404);
    }
    const findMatch = /^\/3\/find\/(tt\d+)$/.exec(path);
    if (method === 'GET' && findMatch) {
      const hit = Object.entries(TMDB_DETAILS).find(([, d]) => d.external_ids.imdb_id === findMatch[1]);
      const media = hit?.[0].split(':')[0] as Media | undefined;
      return json({
        movie_results: media === 'movie' ? [{ id: hit![1].id }] : [],
        tv_results: media === 'tv' ? [{ id: hit![1].id }] : [],
      });
    }
    const searchMatch = /^\/3\/search\/(movie|tv)$/.exec(path);
    if (method === 'GET' && searchMatch) {
      const q = (url.searchParams.get('query') ?? '').toLowerCase();
      const results = Object.entries(TMDB_DETAILS)
        .filter(([key, d]) => key.startsWith(`${searchMatch[1]}:`) && (d.title ?? d.name ?? '').toLowerCase().includes(q))
        .map(([key]) => listItem(key));
      return json({ page: 1, results, total_pages: 1, total_results: results.length });
    }
    return json({ success: false, status_code: 34 }, 404);
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    lists,
    sessions,
    deletedSessions,
    /** Simula que el usuario aprueba el request token en themoviedb.org. */
    approve: (requestToken: string) => approved.add(requestToken),
  };
}

# Capacidades de integración · APPINITY Claude

Estado verificado de cada fuente. **Nada está disponible como integración real hasta que su fila lo diga con
evidencia.** Las capacidades de un manifest solo reflejan lo comprobado en la documentación oficial y en una
conexión real. Las fuentes simuladas no validan ninguna integración real.

## Fuentes simuladas (DEMO_MODE) · fase 1

Comparten la estructura común de `packages/integrations/src/profile/<fuente>/` (`index`, `manifest`, `auth`,
`client`, `sync`, `mapper`, `schemas`, `constants`, `fixtures`) y el mismo contrato y pipeline que usarán las reales.
Leen actividad **ficticia** de archivos del repositorio sobre objetos **reales** del catálogo de la demo.
`authentication: 'fixture'`: no hay OAuth, credenciales ni proveedores.

| Clave | Imita la clase de evidencia de | Categorías | Sync | Señales simuladas | Mapper |
|---|---|---|---|---|---|
| `fixture_screen` | TMDb | movies, series | incremental, paginado | Valoración 1–10, watchlist, visto sin valoración (y un registro inválido a propósito) | `fixture-screen-v1` |
| `fixture_diary` | Diarios tipo Letterboxd/Goodreads | movies, books | incremental, paginado | Estrellas 0,5–5, «quiero», registro sin nota, ISBN de edición, fechas solo con año, libro sin IDs | `fixture-diary-v1` |
| `fixture_activity` | Google (Maps/actividad) | food, culture, movies | incremental, paginado | Guardado, reseña 1–5, visita inferida, asistencia confirmada, evento de calendario, pulgares | `fixture-activity-v1` |
| `fixture_play` | Steam | games | instantánea completa | Biblioteca con minutos (incluidos 0 min), último uso; appid no presente en el catálogo | `fixture-play-v1` |
| `fixture_audio` | Last.fm (+ podcasts) | music, podcasts | instantánea completa | Escuchas por artista, canciones favoritas, episodios (agregados por programa), suscripciones | `fixture-audio-v1` |

Parámetros de normalización: [decisions.md](decisions.md#normalización-y-parámetros-de-los-mappers-fixture-propuestas-sin-calibrar).
Tests: `packages/integrations/test/fixture-adapter.test.ts` (registro en bruto → observaciones esperadas, contrato,
paginación, instantáneas, agregación) y `packages/ingestion/test/pipeline.int.test.ts` (pipeline completo).

## Steam · fase 2

**Estado:** implementado, probado con respuestas simuladas y **validado con la cuenta real del usuario**
(2026-10-08: 11 juegos importados, segundo sync sin duplicados; detalle en [progress.md](progress.md)).

### Ficha (verificada el 2026-10-08)

| Aspecto | Comprobado en la documentación oficial |
|---|---|
| Identificación | Steam es proveedor **OpenID 2.0**: `https://steamcommunity.com/openid` (XRDS), endpoint `https://steamcommunity.com/openid/login`. El Claimed ID es `https://steamcommunity.com/openid/id/<steamid>`. Solo identifica la cuenta; no da acceso a datos ([User Authentication and Ownership](https://partner.steamgames.com/doc/features/auth), [steamcommunity.com/dev](https://steamcommunity.com/dev)) |
| Acceso a datos | **Steam Web API** con clave de usuario (`https://steamcommunity.com/dev/apikey`); requiere aceptar los [Terms of Use](https://steamcommunity.com/dev/apiterms). Host público `api.steampowered.com` ([Web API Keys](https://partner.steamgames.com/doc/webapi_overview/auth)). No es OAuth: no hay tokens por usuario ni scopes |
| Biblioteca | `IPlayerService/GetOwnedGames/v1` (`steamid`, `include_appinfo`, `include_played_free_games`): `game_count` y `games[]` con `appid`, `name`, `playtime_forever` (minutos acumulados), `playtime_2weeks`, `rtime_last_played`, `img_icon_url` ([IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService), [Valve Developer Community](https://developer.valvesoftware.com/wiki/Steam_Web_API)) |
| Visibilidad | `ISteamUser/GetPlayerSummaries/v2` (máx. 100 SteamID). `communityvisibilitystate`: 1 = no visible para quien pregunta, 3 = público. GetOwnedGames solo devuelve la biblioteca si es visible, **salvo que la clave pertenezca a la misma cuenta** |
| Paginación | No hay: GetOwnedGames devuelve la biblioteca completa (instantánea) |
| Historial | No: solo horas acumuladas, horas de las últimas 2 semanas y última partida. No hay eventos ni valoraciones |
| Límites | 100.000 llamadas al día por clave (Terms of Use). Cada sync usa 2 llamadas. HTTP 429 ante exceso |
| Almacenamiento | Los Terms exigen informar al usuario de los datos guardados y consultar solo los datos que el usuario pide. La clave es confidencial |
| Imágenes | La Web API solo documenta iconos (`img_icon_url`). La cápsula 600×900 del CDN público no está documentada en la Web API: se guarda **solo como referencia**, sin copiarla |
| Revocación | OpenID no deja token que revocar. Al desconectar se olvida el SteamID y, si se pide, se borra lo importado. El usuario puede además revocar su clave en steamcommunity.com/dev/apikey |
| Marca | Steam pide enlazar su inicio de sesión con sus botones oficiales («Sign in through Steam»): la app usa `sits_01.png` |

### Implementación

| Pieza | Detalle |
|---|---|
| Adapter | `packages/integrations/src/profile/steam/` (`manifest`, `auth`, `client`, `sync`, `mapper`, `schemas`, `constants`, `fixtures`) |
| Conexión | La app pide `POST /v1/me/connections {sourceKey: 'steam', returnUrl}`. La API guarda un `state` de un solo uso (Redis, 10 min) y devuelve la URL de Steam. El usuario inicia sesión **en Steam**. Steam vuelve a `GET /v1/connect/steam/callback`, la API verifica la respuesta (modo, endpoint, `return_to` exacto, Claimed ID, campos firmados, nonce ≤ 5 min y `check_authentication` contra Steam) y redirige a la app |
| Datos guardados | Solo el SteamID64 (como texto) en la conexión, mientras está activa. La clave de la Web API vive en `.env` del servidor y nunca llega al móvil |
| Sync | Instantánea completa: GetPlayerSummaries + GetOwnedGames. Una observación por juego (`library`, `app:<appid>`) que se actualiza en cada sync; los juegos que salen de la biblioteca dejan de ser evidencia vigente |
| Normalización | 0 min: conocido 1, consumido 0, preferencia NULL. Menos de 2 h: consumido 1, preferencia NULL. Desde 2 h: preferencia inferida `min(1, log1p(h) / log1p(p95 del usuario))`, confianza 0,6 (`steam-v1`, propuesta sin calibrar) |
| Errores | 401/403 (clave): no se reintenta. 429/5xx/red: reintentos con backoff (respeta `Retry-After`) y después reintento del trabajo. Biblioteca no visible: error accionable («Detalles de juegos» en Público), conexión en estado «error» y **sin borrar** evidencia. Entradas corruptas: errores parciales |
| Programación | El worker revisa cada hora y sincroniza las conexiones de Steam con más de `SYNC_INTERVAL_HOURS` (24 h por defecto) |
| Usuarios | Solo usuarios reales (`dataset = live`). En desarrollo, una «cuenta local real» (`pnpm user:local`) |
| Tests | `packages/integrations/test/steam.test.ts` (OpenID, cliente, límites, perfiles privados, mapper) y `packages/ingestion/test/steam.int.test.ts` (pipeline completo con usuarios simulados `test_steam_*` y SteamID simulados fuera del rango de cuentas reales) |

## Fuentes reales previstas

Revisión del 2026-10-08: análisis de más de 60 plataformas en [fuentes-de-datos.md](fuentes-de-datos.md). Se muestran
en la app como «Próximamente · fase N» y no son conectables. Sus manifests declaran todas las capacidades a `false`
hasta verificarlas con una conexión real.

| Fuente | Categorías | Autenticación | Estado | Evidencia |
|---|---|---|---|---|
| Google Data Portability (Búsqueda, Maps, YouTube, YouTube Music, Play, reservas) | las ocho | OAuth de Google, acceso temporal renovable | Pendiente · fases 3 y 4 | Documentación oficial revisada; falta la ficha y un export real |
| Google Books API | books | OAuth (scope `books`) | Pendiente · fase 11 | Documentación oficial revisada |
| Apple Music (MusicKit) | music | Autorización en el dispositivo | Pendiente · fase 11 | Documentación revisada; condiciones de MusicKit por confirmar |
| Calendario del dispositivo | food, culture | Permiso nativo | Pendiente · fase 11 | — |
| itch.io, SoundCloud, Eventbrite, Meetup, Foursquare Swarm | games, music, culture, food | OAuth | P2 · fase 11, tras confirmar condiciones | fuentes-de-datos.md |

**Descartadas o condicionadas:**
- TMDb se implementó y se descartó por ser de uso no comercial (PR rferrermontesinos/appinity-claude#4 cerrada).
- Spotify, Last.fm, Trakt, IGDB, Uber Eats, TheFork, DICE, Resident Advisor y Podchaser requieren acuerdo comercial.
- Gmail está en evaluación.
- Las plataformas sin API de usuario (Netflix, Disney+, Prime Video, Movistar+, Filmin, Xbox, PlayStation, Epic, Glovo,
  Just Eat, Apple Podcasts, Podimo…) no son viables.

Antes de implementar cada fuente real se añadirá su ficha: documentación oficial, endpoints, scopes, aprobación,
paginación, límites, permisos de almacenamiento y política de revocación.

## Proveedores de catálogo

| Clave | Tipo | Estado |
|---|---|---|
| `wikidata_snapshot` | Instantánea congelada de Wikidata (CC0) + imágenes de Wikimedia Commons con licencia libre | Implementado para la demo (`dataset = demo`). No llama a la red en tiempo de ejecución |
| Wikidata en vivo, MusicBrainz (núcleo CC0), TVmaze (CC BY-SA) | Licencias compatibles con uso comercial | Pendiente; ver fuentes-de-datos.md. TMDb, IMDb e IGDB requieren licencia |

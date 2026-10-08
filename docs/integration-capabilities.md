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
| Conexión | La app pide `POST /v1/me/connections {sourceKey: 'steam', returnUrl}`. La API guarda un `state` de un solo uso (Redis, 10 min) y devuelve la URL de Steam. El usuario inicia sesión **en Steam**. Steam vuelve a `GET /v1/connect/steam/callback/<state>` (desde la fase 3 el `state` va en la ruta; `?state=` se sigue aceptando), la API verifica la respuesta (modo, endpoint, `return_to` exacto, Claimed ID, campos firmados, nonce ≤ 5 min y `check_authentication` contra Steam) y redirige a la app |
| Datos guardados | Solo el SteamID64 (como texto) en la conexión, mientras está activa. La clave de la Web API vive en `.env` del servidor y nunca llega al móvil |
| Sync | Instantánea completa: GetPlayerSummaries + GetOwnedGames. Una observación por juego (`library`, `app:<appid>`) que se actualiza en cada sync; los juegos que salen de la biblioteca dejan de ser evidencia vigente |
| Normalización | 0 min: conocido 1, consumido 0, preferencia NULL. Menos de 2 h: consumido 1, preferencia NULL. Desde 2 h: preferencia inferida `min(1, log1p(h) / log1p(p95 del usuario))`, confianza 0,6 (`steam-v1`, propuesta sin calibrar) |
| Errores | 401/403 (clave): no se reintenta. 429/5xx/red: reintentos con backoff (respeta `Retry-After`) y después reintento del trabajo. Biblioteca no visible: error accionable («Detalles de juegos» en Público), conexión en estado «error» y **sin borrar** evidencia. Entradas corruptas: errores parciales |
| Programación | El worker revisa cada hora y sincroniza las conexiones de Steam con más de `SYNC_INTERVAL_HOURS` (24 h por defecto) |
| Usuarios | Solo usuarios reales (`dataset = live`). En desarrollo, una «cuenta local real» (`pnpm user:local`) |
| Tests | `packages/integrations/test/steam.test.ts` (OpenID, cliente, límites, perfiles privados, mapper) y `packages/ingestion/test/steam.int.test.ts` (pipeline completo con usuarios simulados `test_steam_*` y SteamID simulados fuera del rango de cuentas reales) |

## TMDb · fase 3

**Estado:** implementado y probado con respuestas simuladas (fixtures con el formato documentado). **La conexión con
una cuenta real está pendiente** de que el usuario cree su token de la API, lo guarde en el servidor y autorice su
cuenta desde el teléfono. No se considera validada hasta entonces.

### Ficha (verificada el 2026-10-08)

| Aspecto | Comprobado en la documentación y las condiciones oficiales |
|---|---|
| Autenticación de la aplicación (catálogo) | «API Read Access Token» (un JWT) en `Authorization: Bearer …`; vale para v3 y v4. Se obtiene al registrar la aplicación en <https://www.themoviedb.org/settings/api>. Solo servidor ([Authentication](https://developer.themoviedb.org/docs/authentication-application)) |
| Autorización del usuario | Flujo de sesión v3: `GET /3/authentication/token/new` (request token, caduca a los 60 min) → el usuario lo aprueba en `https://www.themoviedb.org/authenticate/{token}?redirect_to=…` → `POST /3/authentication/session/new` → `session_id`, que la documentación pide **tratar como una contraseña** ([How do I generate a session ID?](https://developer.themoviedb.org/reference/authentication-how-do-i-generate-a-session-id)). La documentación no especifica los parámetros con los que se vuelve a `redirect_to`; se acepta `request_token`, `approved` y `denied` y se valida lo esencial en el servidor (ver Implementación) |
| Revocación | `DELETE /3/authentication/session {session_id}` |
| Cuenta | `GET /3/account/{account_id}?session_id=…` (detalles; `id`, `username`). El id aún no se conoce al crear la sesión: se usa `/3/account` y, si no existiera, la forma con id |
| Señales personales | `/3/account/{id}/rated/movies` y `/rated/tv` (campo `rating`), `/favorite/movies` y `/favorite/tv`, `/watchlist/movies` y `/watchlist/tv`, con `session_id`. Paginadas (20 por página, `page`, `total_pages`), `sort_by` = `created_at.asc` o `created_at.desc` |
| Escala de valoración | 0,5–10 en pasos de 0,5 (el ejemplo oficial de valoración usa `8.5`) |
| Fechas | Las listas **no** incluyen la fecha de la valoración ni del favorito. No hay historial de visionado ni lista de «vistas» |
| Otras listas | Listas personalizadas y valoraciones de episodios existen, pero **no se importan** en v1 (semántica ambigua o granularidad distinta) |
| Límites | Orientativo ~40 peticiones/s; HTTP 429 ante exceso |
| Imágenes | `https://image.tmdb.org/t/p/{tamaño}{ruta}` (se usa `w500`) |
| Atribución | Logo aprobado de TMDB, sin modificar, menos prominente que el de la app, y aviso en una sección «Acerca de» o «Créditos». Se usa el texto de las Condiciones, «This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB»; la FAQ muestra una variante más corta ([FAQ](https://developer.themoviedb.org/docs/faq), [logos](https://www.themoviedb.org/about/logos-attribution)). Uso gratuito solo **no comercial**; licencia comercial a través de sales@themoviedb.org |
| Condiciones | No cachear contenido de TMDb más de **6 meses** (§1.C); borrar al terminar el acuerdo; el uso **comercial** necesita un acuerdo escrito con TMDb (§2.A); no usar el contenido para entrenar modelos de IA ([API Terms of Use](https://www.themoviedb.org/api-terms-of-use)) |

### Implementación

| Pieza | Detalle |
|---|---|
| Separación | `packages/integrations/src/tmdb/` (cliente HTTP con el token de la **aplicación**), `profile/tmdb/` (adapter de **perfil**: sesión del usuario, sync y mapper) y `catalog/tmdb.ts` (proveedor de **catálogo**, sin sesiones de usuario). El motor no depende de TMDb |
| Conexión | `POST /v1/me/connections {sourceKey: 'tmdb', returnUrl}`: la API pide el request token, lo guarda en Redis con un `state` de un solo uso (10 min) y devuelve la URL de aprobación con `redirect_to = /v1/connect/tmdb/callback/<state>` (el `state` va en la ruta porque TMDb añade su propia query). En la vuelta se rechaza `denied=true` o un `request_token` distinto del guardado; después se crea la sesión (TMDb solo la emite si el token fue aprobado) y se lee la cuenta |
| Datos guardados | El id de cuenta de TMDb (referencia externa) y el `session_id` **cifrado** (AES-256-GCM, `CREDENTIALS_ENCRYPTION_KEY`, AAD = id de la conexión) en `source_credentials`, en la misma transacción que la conexión. Nunca sale del servidor ni aparece en respuestas o logs. El token de la aplicación vive en `.env` del servidor |
| Sync | Instantánea completa de las seis listas, paginadas (máx. 250 páginas por lista). Una observación por elemento y lista (`rating`, `favorite`, `watchlist`; `movie:<id>` o `tv:<id>`); lo que sale de una lista deja de ser evidencia si el sync fue completo y sin errores |
| Normalización (`tmdb-v1`) | Valorada: conocida 1, consumida 1, `explicit_rating` lineal en 0,5–10 (0,5 → −1, 10 → +1), confianza 1. Favorita: conocida 1, consumida 0, `explicit_like` +0,8, confianza 0,9. Pendiente: conocida 1, consumida 0, preferencia NULL. Sin `occurredAt` |
| Resolución | IDs con espacio de nombres `tmdb:movie` y `tmdb:tv` (nunca se confunden). El proveedor de catálogo pide la ficha con `external_ids` y añade IMDb y Wikidata, así un objeto ya presente desde otra fuente no se duplica. En desarrollo (`DEMO_MODE`), si la película está en la instantánea de Wikidata se usa esa ficha (imagen libre) |
| Imágenes | Póster `w500` del CDN de TMDb **solo como referencia** (`reference-only`, `attributionRequired`, `licenseUrl` = condiciones); no se cachea. Atribución «TMDB» en cada imagen y tarjeta de créditos con logo y aviso en Perfil |
| Caducidad (6 meses) | Cada ficha guarda `providerCache.expiresAt` (+180 días). El worker revisa a diario (`refresh-catalog`) y vuelve a pedir las caducadas; si TMDb ya no la tiene, se retiran su descripción e imagen y se conserva el objeto |
| Errores | Token de la app rechazado (401): no se reintenta. Sesión revocada en TMDb (401 con sesión): conexión en «error» con «vuelve a conectar TMDb» y **sin borrar** evidencia. 429/5xx/red: reintentos con backoff (`Retry-After`). Valoraciones fuera de escala o elementos corruptos: errores parciales |
| Desconexión | Borra credenciales, cuenta y (si se pide) lo importado, y después llama a `DELETE /3/authentication/session`. La API devuelve `providerRevocation` (`revoked`, `failed` o `not_applicable`) y la app lo muestra. Si al conectar no se puede guardar la sesión (otra cuenta ya vinculada, falta la clave de cifrado), se revoca en el acto |
| Usuarios | Solo usuarios reales (`dataset = live`) |
| Tests | `packages/integrations/test/tmdb.test.ts` (flujo de sesión, cliente, sync paginado, mapper, catálogo, registro), `packages/ingestion/test/tmdb.int.test.ts` (cifrado, pipeline, deduplicación por IMDb, cambios de lista, sesión revocada, caducidad, desconexión) y `apps/api/test/tmdb-local.int.test.ts` (flujo HTTP completo con TMDb simulado) |

### Pendiente

- **Validación con una cuenta real** (requiere el token del usuario).
- **Acuerdo comercial con TMDb** antes de cualquier uso comercial (Premium, fase 12): las condiciones lo exigen.

## Fuentes reales previstas

Se muestran en la app como «Próximamente · fase N» y no son conectables. Sus manifests declaran todas las
capacidades a `false` hasta verificarlas.

| Fuente | Categorías | Autenticación prevista | Estado | Evidencia |
|---|---|---|---|---|
| Last.fm | music | Por verificar | Pendiente · fase 4 | — |
| Google Activity / Data Portability | potencialmente las ocho | Por verificar | Pendiente · fase 11 | — |
| Apple Music | music | Por verificar | Pendiente · fase 11 | — |
| SoundCloud, Plex, Google Books, Podchaser, Eventbrite, calendario del dispositivo | ver especificación §9 | Por verificar | Pendiente · fase 11 | — |

Antes de implementar cada fuente real se añadirá su ficha: documentación oficial, endpoints, scopes, aprobación,
paginación, límites, permisos de almacenamiento y política de revocación.

## Proveedores de catálogo

| Clave | Tipo | Estado |
|---|---|---|
| `wikidata_snapshot` | Instantánea congelada de Wikidata (CC0) + imágenes de Wikimedia Commons con licencia libre | Implementado para la demo (`dataset = demo`) y, en desarrollo, también para objetos reales. No llama a la red en tiempo de ejecución |
| `tmdb` | API v3 de TMDb con el token de la aplicación: ficha, IMDb y Wikidata, póster como referencia | Implementado (fase 3), solo `dataset = live`. Resuelve únicamente por ID (TMDb o IMDb), nunca por título. Contenido renovado antes de 180 días |
| MusicBrainz, Open Library, etc. como proveedores en vivo | — | Pendiente; se decidirá con cada fuente real |

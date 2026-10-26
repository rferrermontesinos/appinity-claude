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

## Google Data Portability · fase 3 (valoraciones y lugares)

**Estado:** implementado y probado con un Google simulado (formatos de la documentación oficial). Los identificadores de
catálogo se probaron **en vivo** contra OpenStreetMap y Wikidata. **La conexión con una cuenta real está pendiente** de
que el usuario cree el proyecto de Google Cloud y autorice su cuenta; tampoco se ha visto aún un export real. No se
considera validada hasta entonces.

### Ficha (verificada el 2026-10-09)

| Aspecto | Comprobado en la documentación oficial |
|---|---|
| Proyecto | Proyecto de Google Cloud con **cuenta de facturación activa** (requisito de la guía de configuración) y la Data Portability API habilitada. La API no tiene precio publicado: su ficha del Marketplace indica 0 y la DMA obliga a ofrecerla gratis ([setup](https://developers.google.com/data-portability/user-guide/setup)) |
| Autorización | OAuth 2.0 de servidor web. Los scopes `https://www.googleapis.com/auth/dataportability.<grupo>` **no se pueden mezclar** con otros (ni openid ni email) y no se usa `include_granted_scopes` ([configurar OAuth](https://developers.google.com/data-portability/user-guide/configure-oauth)). No hay, por tanto, identidad de la cuenta en la conexión |
| Duración | El usuario elige: una vez, 30 o 180 días (`refresh_token_expires_in`). En modo **Testing**, 7 días siempre; la renovación solo existe con el cliente en producción ([acceso temporal](https://developers.google.com/data-portability/user-guide/time-based)) |
| Exports | `POST /v1/portabilityArchive:initiate {resources}` → `archiveJobId`; `GET /v1/archiveJobs/{id}/portabilityArchiveState` → `IN_PROGRESS`, `COMPLETE` (URLs firmadas que caducan a las 6 h; datos 14 días), `FAILED` o `CANCELLED`; `:retry` (3 veces); revisar cada 5–60 min; máximo 7 días ([métodos](https://developers.google.com/data-portability/user-guide/methods)) |
| Límites | Acceso temporal: un export por grupo cada 24 h (429 `RESOURCE_EXHAUSTED_TIME_BASED`). Acceso único: uno solo (`RESOURCE_EXHAUSTED_ONE_TIME`). Google recomienda un export por grupo |
| Revocación | `POST /v1/authorization:reset` revoca todos los permisos de Data Portability concedidos a la app; además se revoca el refresh token |
| Datos de la fase 3 | `maps.reviews` y `maps.starred_places` (GeoJSON: nombre, dirección, país, coordenadas, enlace, fecha; reseñas con estrellas 1–5). `search_ugc.media.reviews_and_stars`, `.thumbs` y `.watched` (JSON con «Search Query», «Published», «Updated», «Review Star Rating» en texto y «Thumbs Rating») ([Maps](https://developers.google.com/data-portability/schema-reference/local_actions), [Búsqueda](https://developers.google.com/data-portability/schema-reference/search_ugc)) |
| Lo que NO trae | Ningún identificador ni tipo de objeto en la Búsqueda (solo el texto buscado), ni la categoría del lugar en Maps. Por eso hace falta identificar cada registro (ver Implementación) |
| Export real (2026-10-09) | `maps.reviews`: `Reviews.json` + `archive_browser.json` (índice). Claves documentadas, más `Comment`. Los enlaces de Maps tienen la forma `/maps/place//data=!4m2!3m1!1s0x<hex>:0x<hex>`, no `?cid=`; el segundo número es el CID del lugar (conocimiento de la comunidad, por confirmar). `maps.starred_places`: `Saved Places.json`, enlaces `?cid=`. Grupos de la Búsqueda: vacíos en la cuenta probada (formato sin comprobar). Primer sync: 21 evidencias |
| Países | UE, Suiza y Reino Unido; mayores de 18 años |
| Política | Uso aprobado: apps cuya función principal es trasladar datos de Google; uso limitado a funciones visibles para el usuario. Scopes restringidos → auditoría CASA. Pendiente de confirmar en la verificación ([política](https://developers.google.com/data-portability/policy)) |

### Implementación

| Pieza | Detalle |
|---|---|
| Adapter | `packages/integrations/src/profile/google-portability/` (`constants`, `client`, `auth`, `archive`, `sync`, `mapper`, `schemas`, `manifest`, `fixtures`) |
| Conexión | Un consentimiento de Google con solo los 5 grupos que se importan (scopes mínimos), `access_type=offline`, `prompt=consent` y PKCE (el verificador viaja con el `state` en Redis). En la vuelta se comprueba qué grupos concedió de verdad el usuario y qué tipo de acceso eligió |
| Desarrollo | Google solo admite URLs de vuelta `http` con `localhost`: el consentimiento se hace desde la vista web del PC (`pnpm --filter @appinity/mobile web`). En el teléfono, la app lo explica en vez de abrir un flujo que no volvería. En producción, la URL de vuelta será el dominio HTTPS de la API |
| Datos guardados | Refresh token, grupos concedidos y estado de los exports, **cifrados** (AES-256-GCM, AAD = conexión). Sin cuenta externa. Nunca se guarda el texto de las reseñas |
| Sync | Un export por grupo. El id del trabajo se guarda cifrado **antes** de esperar. Mientras Google lo prepara, la ejecución se **aplaza** (el worker la reprograma con el ritmo recomendado, sin gastar reintentos). Al completarse se descargan y leen los ZIP y se retira solo la evidencia de los grupos exportados en ese sync |
| Identificación | Lugares: OpenStreetMap (Overpass), elementos con nombre a ≤ 100 m clasificados por etiquetas (restaurante, museo, teatro, monumento…). Nombre idéntico 0,95; sin palabras genéricas 0,85; contenido en el de OSM 0,75 (0,7 si hay que elegir el único notable). Obras: Wikidata, etiqueta o alias idéntico y tipo reconocido; único 0,8, dominante en enlaces a Wikipedias 0,65; un disco se atribuye a su artista. Lo ambiguo **no** se importa y se informa sin bloquear la instantánea |
| Normalización (`google-portability-v1`) | Estrellas 1–5: (r − 3) / 2. Pulgar: ±0,8, confianza 0,9, consumo 0,7. «Visto»: consumido sin preferencia. Guardado: conocido sin consumo. La confianza de la identificación multiplica las confianzas. Fecha del registro como `occurredAt` |
| Renovación | «Renovar permiso» reutiliza la conexión: sustituye las credenciales y conserva lo importado |
| Desconexión | Borra credenciales y (si se pide) lo importado; después `authorization:reset` y revocación del token. La app muestra si Google lo confirmó |
| Estructura del export | El worker registra, por grupo, archivos, número de registros, claves y patrones de URL, **sin datos personales**, para contrastar el formato real con el documentado |
| Tests | `packages/integrations/test/google-portability.test.ts` (OAuth, archivo, máquina de estados, mapper, OSM y Wikidata simulados, casos reales de OSM), `packages/ingestion/test/google.int.test.ts` (pipeline, aplazamiento, instantánea por grupo, renovación, revocación) y `apps/api/test/google-local.int.test.ts` (flujo HTTP) |

## Google Data Portability · fase 4 (YouTube y YouTube Music)

**Estado:** implementado y probado con un Google simulado (formatos de la documentación oficial). La identificación
de canales y artistas se probó **en vivo** contra Wikidata. **Pendiente de validar con una cuenta real**: hay que
añadir los 3 permisos al proyecto de Google Cloud y renovar el permiso (README). No se considera validada hasta ver un
export real.

### Ficha (verificada el 2026-10-13)

| Aspecto | Comprobado en la documentación oficial |
|---|---|
| Grupos | `myactivity.youtube` (Mi actividad de YouTube, que incluye YouTube Music), `youtube.music` (biblioteca de YouTube Music) y `youtube.subscriptions`. Mismo consentimiento y mismos límites que la fase 3 ([YouTube](https://developers.google.com/data-portability/schema-reference/youtube), [Mi actividad](https://developers.google.com/data-portability/schema-reference/my_activity)) |
| `myactivity.youtube` | Registros en HTML y JSON: `header`, `title`, `titleUrl`, `subtitles` (canal), `description`, `time`, `products`, `details`, `activityControls`… Incluye búsquedas, visitas y anuncios. Puede llevar adjuntos de imagen y audio. La documentación no menciona expresamente las escuchas de YouTube Music: se comprobará con un export real |
| `youtube.subscriptions` | CSV con «Channel ID», «Channel URL» y «Channel Title» |
| `youtube.music` | CSV «music library songs» («Video ID», «Song Title», «Album Title», «Artist Name») y la música subida por el usuario (archivos originales, que no se leen ni se descomprimen) |
| Política | La de Data Portability no menciona YouTube ni las condiciones de YouTube API Services; su único caso aprobado sigue siendo «trasladar datos». Es el mismo bloqueo de producción que la fase 3 ([política](https://developers.google.com/data-portability/policy)) |

### Implementación

| Pieza | Detalle |
|---|---|
| Código | `packages/integrations/src/profile/google-portability/youtube.ts` (lectura, agregación e identificación) dentro del mismo adapter; el consentimiento pide ya los 8 grupos |
| Escuchas | Solo cuentan las reproducciones (URL `/watch?v=`) con canal y sin `details` (anuncios); los títulos están traducidos al idioma de la cuenta y no se usan. Se agregan por canal y se identifican como máximo los 400 más escuchados |
| Identificación | Canal → Wikidata por la propiedad P2397 (ID de canal de YouTube), en lotes de 40: coincidencia exacta, 0,95. Solo artistas musicales y podcasts; personas no músicas y otros canales quedan fuera de categoría. Si el canal no figura y es un «Artista - Topic» o se escuchó en YouTube Music, se busca el artista por nombre exacto (0,8 o 0,65) sin atribuirle el ID del canal. Biblioteca: artistas por nombre exacto, solo músicos |
| Agregación | Los canales de un mismo artista (el oficial y el «Topic») se fusionan por su entidad de Wikidata. Una observación por artista o programa y tipo |
| Normalización (`google-portability-v1`) | Escuchas: consumido; desde 3 escuchas, preferencia `min(1, log1p(n) / log1p(p95 del usuario en esa categoría))` con confianza 0,6 × identificación (`strong_behavior`). Suscripción y biblioteca: conocido, no consumido, preferencia NULL |
| Permisos nuevos | La API compara los scopes que pide el adapter con los concedidos (`missingScopes`) y la app pide renovar el permiso para importar YouTube |
| Tests | `packages/integrations/test/youtube.test.ts` (CSV, extracción, límites, fusión, Wikidata y mapper), `packages/ingestion/test/google.int.test.ts` (pipeline con YouTube) y `apps/api/test/google-local.int.test.ts` (permisos que faltan) |

## Google Data Portability · fase 11 (Google Play, pedidos y guardados)

Mismo consentimiento de Google: los tres grupos se añaden a los que pide el alta. Google no admite autorización
incremental, así que en las cuentas ya conectadas basta un «Renovar permiso».

### Ficha (verificada el 2026-10-14)

| Grupo | Comprobado en la documentación oficial |
|---|---|
| `play.library` (Sensitive) | [Esquema de Play](https://developers.google.com/data-portability/schema-reference/play): objeto `Library` con `doc` (JSON: «título y tipo de documento») y `acquisitionTime`. El esquema no detalla `doc`. Se aceptan `title` y `documentType`/`docType` y, si aparece, el ID de paquete. Pendiente de confirmar con un export real; el worker registra los tipos vistos |
| `order_reserve.purchases_reservations` (Sensitive) | [Esquema de compras y reservas](https://developers.google.com/data-portability/schema-reference/my_orders): JSON. Pedidos con `transactionMerchant.name`, `creationTime`, `orderStatus`, `lineItem` y `paymentInfo`. Reservas con `merchantName`, `address`, `startTime`, `partySize` y `canceled` |
| `saved.collections` (Sensitive) | [Esquema de guardados](https://developers.google.com/data-portability/schema-reference/save): un CSV por colección (`Title`, `Note`, `URL`, `Tags`, `Comment`), con la descripción opcional de la colección en la primera línea |

### Implementación

| Pieza | Detalle |
|---|---|
| Extracción | `profile/google-portability/play-orders-saved.ts` |
| Biblioteca de Play | Libros, apps, películas y series. La música no se usa: el artista sale de YouTube Music |
| Pedidos y reservas | Se agregan por comercio: por nombre, y la dirección solo separa locales distintos de una cadena. Los cancelados y las reservas futuras no cuentan |
| Guardados | Solo cuentan los enlaces de Maps |
| Minimización | Nunca se guardan platos, importes, pagos, notas ni comentarios |
| Identificación de Play | Apps con ID de paquete: búsqueda exacta por P3418 (ID de Google Play Store) en Wikidata, por lotes. Solo se aceptan videojuegos; el resto de apps queda fuera de categoría |
| Identificación por título | Libros, películas, series y apps sin ID, limitado a su categoría (`identifyWork({ categories })`) |
| Identificación de lugares | Lugares sin coordenadas: **Nominatim** (dirección y, si falla, nombre + ciudad; sin dirección, el nombre) y, con esa posición, la misma regla OSM de nombre y tipo a ≤ 100 m. Confianza × 0,9. Si el enlace de Maps trae `@lat,lng`, va directo a OSM |
| Normalización | Play: conocido (`owned`), no consumido, preferencia NULL. Pedidos y reservas: conocido y consumido; desde 2 visitas, preferencia `min(1, log1p(n)/log1p(p95))` con base `attendance` y confianza 0,5. Guardado: conocido, no consumido, NULL |
| Avisos | Lo descartado a propósito (cancelado, futuro, no es un lugar, música) **no** cuenta como «datos incompletos» |
| Topes por sync | 400 objetos de Play (los más recientes) y 150 lugares sin coordenadas |
| Nominatim | [Política](https://operations.osmfoundation.org/policies/nominatim/): ≤ 1 consulta/s, User-Agent identificable, caché obligatoria, nada de uso masivo o periódico. Endpoint configurable con `NOMINATIM_URL`. Con muchos usuarios: instancia propia (software libre, datos ODbL) |
| Prueba real (2026-10-14) | Con los servicios públicos: Can Culleretes y Museu Picasso (por dirección) y Sagrada Família (por nombre) identificados (0,855; 0,855; 0,63). Wikidata (consultas directas, porque la API rechazaba con `maxlag`): P3418 devuelve Monument Valley y Clash Royale como videojuegos (Q7889) y WhatsApp como no videojuego (fuera de categoría) |
| Tests | `packages/integrations/test/google-phase11.test.ts` (12) y `packages/ingestion/test/google.int.test.ts` (ampliado) |

## Google Books · fase 11

| Aspecto | Detalle |
|---|---|
| API | Oficial y gratuita: `GET /books/v1/mylibrary/bookshelves/{id}/volumes` con el scope `https://www.googleapis.com/auth/books` ([docs](https://developers.google.com/books/docs/v1/using), consultadas el 2026-10-15). Hay que activar la «Books API» en el proyecto de Google Cloud |
| Consentimiento | **Alta**: va en el mismo consentimiento de «Continuar con Google» (con `access_type=offline`), así que la fuente queda conectada sin pasos extra. Google deja desmarcarlo. **Cuentas ya creadas**: conexión normal con su propia URL de vuelta (`GOOGLE_BOOKS_REDIRECT_URI`) |
| Estanterías | Favoritos (0), Comprados (1), Por leer (2), Leyendo (3), Leídos (4), Reseñados (5) y Mis eBooks (7). Las de recomendaciones y el historial (6, 8 y 9) no se usan: no son gustos. Hasta 400 libros por estantería |
| Identificación | ID de Google Books en Wikidata (P675, exacto); una edición se atribuye a su obra (P629). Si no, título exacto limitado a libros. Si Wikidata no tiene etiqueta en español ni en inglés, se usa el título de Google. **Prueba real**: P675 `WXIoqjLSaaoC` → Q27102283 |
| Normalización (`google-books-v1`) | Reseña con estrellas: valoración explícita. Favorito: me gusta +0,8. Leído, leyendo o reseñado: consumido. Por leer, comprado o eBook: solo conocido |
| Tests | `packages/integrations/test/google-books.test.ts` (5) y OIDC con Books en `apps/api/test/auth.int.test.ts` |

## Trakt · fase 11

| Aspecto | Detalle |
|---|---|
| Condiciones | [API Use Policy](https://developer.trakt.tv/docs/api-use-policy) (22/09/2026): autorización del usuario; caché permitida para sus funciones; prohibido vender datos o copiar el catálogo. Confirmar con Trakt el uso comercial antes de la beta pública |
| OAuth | PKCE en `https://auth.trakt.tv/oauth/authorize` y `/oauth/token` (el secreto de cliente está obsoleto para usuarios). Access token de 7 días; **cada renovación entrega un refresh token nuevo** que sustituye al anterior: se guarda en cuanto llega |
| API | `https://api.trakt.tv` con las cabeceras `trakt-api-key` y `trakt-api-version: 2`. Rutas de la especificación OpenAPI oficial (`developer.trakt.tv/openapi.json`): `/sync/ratings/{type}`, `/sync/watched/{type}`, `/sync/favorites/{type}/rank/asc` y `/sync/watchlist/{type}/rank/asc`, para películas y series. Hasta 2.000 por lista |
| Identificación | Exacta en Wikidata por IMDb (P345) y, si falta, TMDB (P4947/P4983), en lotes. La categoría debe coincidir con la de Trakt. **Prueba real**: tt0111161 → Q172241 (1994); tt0903747 y TMDB 1396 → Q1079 |
| Normalización (`trakt-v1`) | Valoración 1–10: explícita. Favorito: me gusta +0,8. Visto: consumido. Pendiente: solo conocido |
| Configuración | `TRAKT_CLIENT_ID` (y, opcionalmente, `TRAKT_CLIENT_SECRET`) de una app creada en Trakt (requiere una cuenta de GitHub verificada); URL de vuelta `http://localhost:3100/v1/connect/trakt/callback` |
| Tests | `packages/integrations/test/trakt.test.ts` (5) |

## AniList · fase 11

| Aspecto | Detalle |
|---|---|
| Condiciones | Gratis por debajo de 150 $ al mes de ingresos; no copiar el catálogo. APPINITY guarda solo la evidencia del usuario |
| OAuth | «Authorization code grant» ([docs](https://docs.anilist.co/guide/auth/), consultadas el 2026-10-16): `anilist.co/api/v2/oauth/authorize` y `/oauth/token` con el secreto en el servidor. Sin scopes. **El token dura 1 año y no hay refresh token**: al caducar, el usuario vuelve a conectar. No hay revocación por API |
| API | GraphQL en `https://graphql.anilist.co`: `Viewer { id }` y `MediaListCollection(userId, type: ANIME/MANGA)` por bloques de 500, con `score(format: POINT_100)`, estado, fechas e `isFavourite`. **Prueba real** con listas públicas: anime TV, MOVIE, OVA, ONA, SPECIAL y TV_SHORT; manga MANGA, NOVEL y ONE_SHOT |
| Identificación | Exacta en Wikidata por AniList (P8729 anime, P8731 manga) o MyAnimeList (P4086, P4087). Si no hay ID, título exacto. Anime película → cine; resto del anime → series; manga y novela ligera → libros. **Prueba real**: AniList 21 → Q710324 (serie), 30013 → Q28667972 (manga), 199 → Q155653 (película), MAL 13 → Q28667972. En una lista real de anime se identificaron 22 de 40 obras (12 por ID y 10 por título); el resto se avisa como no identificado |
| Normalización (`anilist-v1`) | Puntuación 1–100: explícita. Favorito: me gusta +0,8. Completado, en curso, en pausa o abandonado: consumido con preferencia NULL. Planeado: solo conocido |
| Configuración | `ANILIST_CLIENT_ID` y `ANILIST_CLIENT_SECRET` de una app creada en anilist.co/settings/developer; URL de vuelta `http://localhost:3100/v1/connect/anilist/callback` |
| Tests | `packages/integrations/test/anilist.test.ts` (6) |

## Google Calendar · fase 11

| Aspecto | Detalle |
|---|---|
| Consentimiento | Scope `calendar.events.readonly` en el **mismo consentimiento** de «Continuar con Google», junto con Books. No hay conexión aparte: una cuenta ya creada lo concede al volver a entrar con Google. Es un scope sensible: en producción requiere la verificación de la app, que es gratuita |
| API | `GET /calendar/v3/calendars/primary/events` con `singleEvents`, `eventTypes=default` y `fromGmail` (las reservas que añade Gmail). Ventana de 2 años atrás a 6 meses adelante. Solo se piden `id`, `status`, `summary`, `location`, `eventType` y `start`; ni descripción ni asistentes. Requiere activar la «Google Calendar API» en el proyecto |
| Qué se extrae | **Lugar**: la primera parte de `location`, geocodificada con OSM y Nominatim. Se ignoran ubicaciones en línea, direcciones sin nombre y lugares privados. **Concierto**: «Concierto: X», «Concierto de X», «X en concierto»… → artista. **Película**: «Cine: X» → película. El resto de títulos no se usa |
| Privacidad | Se procesa en memoria. Solo se guarda el objeto identificado, el número de eventos y la fecha del último; nunca títulos, descripciones ni asistentes |
| Normalización (`google-calendar-v1`) | Intención, no asistencia (especificación §6): conocido 0,8 × confianza de identificación, consumido 0, preferencia NULL |
| Desconexión | No revoca el permiso, porque es el mismo del inicio de sesión y de Books. Se borran las credenciales; el permiso se retira en myaccount.google.com/connections. Books conectado en el alta tampoco revoca |
| Prueba real | Google simulado, con OSM y Wikidata reales, sobre 13 eventos de ejemplo. Se identificaron 6 de 10 planes: Casa Lucio (2 eventos, 1 observación), Teatro Real, Rosalía, Coldplay, Vetusta Morla y Oppenheimer. Los eventos en línea, privados, cancelados y de cumpleaños se ignoraron. Ningún título de evento se guardó. **Falta probar con un calendario real** |
| Tests | `packages/integrations/test/google-calendar.test.ts` (5) |

## Fuentes reales previstas

Revisión del 2026-10-08: análisis de más de 60 plataformas en [fuentes-de-datos.md](fuentes-de-datos.md). Se muestran
en la app como «Próximamente · fase N» y no son conectables. Sus manifests declaran todas las capacidades a `false`
hasta verificarlas con una conexión real.

| Fuente | Categorías | Autenticación | Estado | Evidencia |
|---|---|---|---|---|
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
| `OsmPlaceIdentifier` | OpenStreetMap vía Overpass (ODbL, uso comercial con atribución «© OpenStreetMap contributors») | Implementado (fase 3): identifica y clasifica lugares de Maps en lotes de 25 por consulta (la instancia pública bloquea cada hueco ~60 s por consulta). Trae todos los lugares con nombre cercanos para explicar lo no importado (fuera de categoría, sin coincidencia o ambiguo). Instancia pública para desarrollo; en producción, instancia propia o proveedor |
| `WikidataWorkIdentifier` | API de Wikidata (CC0) | Implementado (fase 3): identifica obras valoradas en la Búsqueda. Fase 4: canales de YouTube por P2397 y artistas por nombre exacto |
| MusicBrainz (núcleo CC0), TVmaze (CC BY-SA) | Licencias compatibles con uso comercial | Pendiente; ver fuentes-de-datos.md. TMDb, IMDb e IGDB requieren licencia |

## Facebook · páginas que te gustan (2026-10-26)

| Aspecto | Detalle |
|---|---|
| Consentimiento | Inicio de sesión con Facebook, solo el permiso `user_likes`; conexión aparte (no es el inicio de sesión de APPINITY). Se comprueba que el permiso se concedió |
| API | Graph API `/me/likes` (id, nombre, usuario, categoría, ubicación y fecha), paginada; token de 60 días sin refresh: al caducar se vuelve a conectar. Al desconectar se retira el permiso (`DELETE /me/permissions`) |
| Identificación | 1) Cuenta de Facebook en Wikidata (P2013), cualquier categoría. 2) Restaurante o lugar cultural con ubicación → OpenStreetMap. 3) Grupo o artista → artistas; programa de TV, película, libro, podcast o videojuego → título en esa categoría. Marcas, personas y empresas se ignoran (no son del catálogo) |
| Semántica (`facebook-v1`) | «Me gusta» explícito débil: preferencia +0,6 con confianza 0,6 × identificación (×0,7 si tiene más de 5 años); conocido; **no** consumido; nunca disgusto |
| Condiciones | Uso permitido por Meta: personalizar la experiencia según los gustos. Producción: App Review y verificación del negocio |
| Prueba | Facebook y catálogo simulados (5 tests). **Falta probar con la cuenta real** |

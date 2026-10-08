# Arquitectura · APPINITY Claude

Documento vivo. Describe lo implementado (fases 0 a 3) y marca lo pendiente. Requisitos:
[APPINITY_Especificacion.md](APPINITY_Especificacion.md). Decisiones y parámetros: [decisions.md](decisions.md).

## Vista general

```text
 Teléfono (Expo Go, SDK 57)              PC de desarrollo
 ┌────────────────────────┐   HTTP   ┌──────────────────────────────────────┐
 │ apps/mobile            │ ───────▶ │ apps/api (NestJS 12, :3100)          │
 │ Expo Router · 4 tabs   │  LAN IP  │ guard global · auth de desarrollo    │
 │ demo del modelo        │          │ /v1/me /v1/sources /v1/me/connections│
 │ TanStack Query/Zustand │ ◀─────── │ /v1/catalog /v1/me/item-profiles     │
 └────────────────────────┘ imágenes │ /media/catalog/* /static/fallback/*  │
                                     └──────┬──────────────┬────────────────┘
                                            │ Drizzle      │ BullMQ (productor)
                                            ▼              ▼
                              PostgreSQL 17 + PostGIS   Redis 7.4
                                            ▲              │
                                            │              ▼
                                     workers/sync-worker (BullMQ)
                                     · profile-sync → pipeline de ingesta
                                     · catalog-images → caché en .data/media
                                     · system: schedule-syncs (1 h), refresh-catalog (24 h)
```

Servicios locales en Docker Compose (proyecto `appinity-claude`). Docker Compose es una propuesta de desarrollo,
no el hosting final.

## Monorepo

pnpm workspaces (`nodeLinker: hoisted`), TypeScript 6.0 con project references (`tsc -b`) y ESM en todos los
paquetes Node. La app móvil la empaqueta Metro y consume `@appinity/shared` e `@appinity/i18n` compilados.

| Paquete | Responsabilidad | Depende de |
|---|---|---|
| `@appinity/shared` | Categorías, contratos (`NormalizedObservation`, `ProfileSourceAdapter`, `CatalogProvider`, `CatalogItem`, `UserItemProfile`), DTOs, validación Zod, nombres de colas | zod |
| `@appinity/i18n` | Textos es/en con las mismas claves (comprobado por test) | — |
| `@appinity/algorithms` | Normalización de escalas, percentiles, señales conductuales y consolidación v1. Puro y versionado; ESLint prohíbe importar proveedores, BD o colas | shared |
| `@appinity/database` | Esquema Drizzle, migraciones SQL, cliente pg, migrate/reset, cifrado de credenciales | shared, algorithms |
| `@appinity/catalog` | Proveedor de la instantánea Wikidata/Commons, `EntityResolver`, importación, caché de imágenes, almacenamiento, fallback, DTO | shared, database |
| `@appinity/integrations` | Registro de adapters y `profile/fixture/` (estructura común de §8) | shared, algorithms, zod |
| `@appinity/ingestion` | `runConnectionSync`, conexiones/desconexión, recálculo de perfiles, colas, seed de demo | todos los anteriores |
| `@appinity/api` | API HTTP | shared, database, catalog, integrations, ingestion |
| `@appinity/sync-worker` | Worker BullMQ | shared, database, catalog, integrations, ingestion |
| `@appinity/mobile` | App Expo | shared, i18n |

El motor y la consolidación (`algorithms`) solo conocen datos normalizados. Los proveedores viven en
`integrations` (perfil) y `catalog` (catálogo), separados entre sí.

## Modelo de datos

Migraciones en `packages/database/drizzle/` (SQL generado por drizzle-kit, revisado y versionado):

| Migración | Contenido |
|---|---|
| `0000_enable_postgis` | Extensiones `postgis` y `pgcrypto` |
| `0001_identity` | `users` (con `dataset` demo/live), `user_profiles` (perfil público mínimo), `user_settings` (zona aproximada `geography`, radio 1–50 km, idioma, notificaciones, descubrimiento por contactos) |
| `0002_catalog_evidence` | Catálogo, conexiones, consentimientos, credenciales, ejecuciones de sync, observaciones y perfiles |
| `0003_local_accounts_external_unique` | `users.local_login_code_hash` (solo dataset live) e índice único de cuenta externa abierta por fuente (un SteamID, un usuario) |

Tablas de la fase 1:

| Tabla | Clave / constraints principales |
|---|---|
| `catalog_items` | `dataset`, `category` (8), `item_type`, `title` y `normalized_title`, `release_date` + `release_date_precision` (día/mes/año, ambos NULL o ambos no), eventos con precisión, `parent_item_id` (edición → obra, temporada → serie; sin autorreferencia), `latitude/longitude` + `location geography` generada con GiST, enlaces, metadatos, `created_via` |
| `catalog_external_ids` | Único por `(dataset, provider, id_type, external_id)`: `tmdb:movie:289` ≠ `tmdb:tv:289`. Guarda quién aportó el ID |
| `catalog_images` | Una imagen principal por objeto: URL de referencia https, `storage_key` si está cacheada, autor, licencia, URL de licencia y página de descripción, `cache_status` (reference/cached/failed) |
| `provider_consents` | Consentimiento por proveedor: scopes, versión y revocación |
| `user_connections` | Una conexión no revocada por usuario y fuente (índice único parcial); cursor JSON, watermark, último estado; `revoked_at` coherente con el estado |
| `source_credentials` | Texto cifrado AES-256-GCM vinculado a la conexión (sin uso hasta la primera fuente real) |
| `source_sync_runs` | Disparador, modo (incremental/full), estado, contadores (insertadas, actualizadas, sin cambios, borradas, objetos creados), errores parciales y cursores antes/después |
| `user_item_observations` | Evidencia normalizada. **Clave idempotente `(connection_id, source_record_id, observation_kind)`**. Rangos 0–1 y −1..+1, `consumed ≤ known`, preferencia/confianza/base NULL a la vez, `occurred_at` y precisión juntos, huella de contenido, `synced_at` separado de `occurred_at` |
| `user_item_profiles` | Una fila por usuario y objeto (PK compuesta): tres dimensiones, base ganadora, número de evidencias y fuentes, conflicto, notas de consolidación, primera y última actividad, versión |

## Pipeline de ingesta (§14)

```text
API (POST /v1/me/connections | /sync)
  └─▶ source_sync_runs (queued) ─▶ BullMQ profile-sync (jobId = runId, 3 intentos, backoff exponencial)
        └─▶ worker: runConnectionSync(runId)
              1. bloqueo de sesión por conexión (pg_try_advisory_lock)
              2. adapter.sync(cursor, pageSize) → SyncBatch (registros, cursor, watermark, errores, instantánea, stats)
              3. adapter.normalize(registro) → NormalizedObservation[] → validación Zod en runtime
                 (registro inválido = error parcial, el sync continúa)
              4. EntityResolver.resolve(candidato, dataset) → objeto canónico (edición → obra)
              5. transacción por lote: comprueba que la conexión sigue activa (FOR SHARE) y escribe
                 insert / update / unchanged según la huella de contenido
              6. instantánea completa sin errores: borra la evidencia de tipos de instantánea que ya no aparece
              7. recalcula los perfiles afectados (consolidación v1) y avanza el cursor solo si todo fue bien
```

- Un fallo no avanza el cursor ni borra evidencia anterior. La ejecución queda `failed` y BullMQ reintenta.
- Una desconexión durante el sync bloquea la escritura del lote siguiente y la ejecución termina `cancelled`.
- Desconectar (`disconnectSource`) revoca la conexión y el consentimiento, borra credenciales y cancela las
  ejecuciones pendientes. La API retira además de la cola los trabajos en espera. Con `purge`, borra las
  observaciones de esa conexión y recalcula los perfiles con las demás fuentes.

## Steam (fase 2)

```text
App (Perfil → Sign in through Steam)
  └─ POST /v1/me/connections {sourceKey:'steam', returnUrl}
       └─ API: state de un solo uso en Redis (10 min) → URL OpenID de steamcommunity.com
  └─ WebBrowser.openAuthSessionAsync(url) → el usuario inicia sesión EN STEAM
  └─ Steam → GET /v1/connect/steam/callback/<state>?openid.*
       └─ API: GETDEL state → verifySteamOpenId (incluye check_authentication) → conexión con SteamID
          → sync completo en cola → 302 a returnUrl?result=connected
Worker: GetPlayerSummaries + GetOwnedGames (clave del servidor) → mapper steam-v1 → pipeline común
```

- Programador horario en el worker (`schedule-syncs`) para fuentes reales con estrategia programada.
- Errores de fuente (`SourceError`): reintentables (429, 5xx, red) o que requieren acción del usuario (clave, perfil
  privado), que dejan la conexión en «error» con el mensaje y no se reintentan.
- Cuenta local real: `pnpm user:local` → `POST /v1/dev/session {handle, code}`; el guard acepta usuarios `live` solo si
  el token lleva la huella del código vigente.

## TMDb (fase 3)

```text
App (Perfil → TMDb → Conectar)
  └─ POST /v1/me/connections {sourceKey:'tmdb', returnUrl}
       └─ API → TMDb: GET /3/authentication/token/new (Bearer TMDB_API_READ_TOKEN, token de la APLICACIÓN)
       └─ API: state de un solo uso + request token en Redis (10 min)
          → https://www.themoviedb.org/authenticate/<token>?redirect_to=<API>/v1/connect/tmdb/callback/<state>
  └─ WebBrowser.openAuthSessionAsync(url) → el usuario aprueba EN TMDB
  └─ TMDb → GET /v1/connect/tmdb/callback/<state>?request_token=…&approved=true
       └─ API: GETDEL state → comprobar token → POST session/new → GET account
          → conexión (id de cuenta) + source_credentials (session_id cifrado, AAD = id de conexión), una transacción
          → sync completo en cola → 302 a returnUrl?result=connected
Worker: descifra la sesión en memoria → 6 listas paginadas → mapper tmdb-v1 → pipeline común
        → TmdbCatalogProvider (ficha + IMDb/Wikidata, solo live) → refresh-catalog diario (6 meses)
Desconectar: borra credenciales y cuenta → DELETE /3/authentication/session → providerRevocation en la respuesta
```

- Paquete `integrations`: `tmdb/` (cliente HTTP común con el token de la aplicación), `profile/tmdb/` (adapter de
  perfil) y `catalog/tmdb.ts` (proveedor de catálogo). El adapter de perfil nunca escribe en el catálogo y el
  proveedor de catálogo no conoce sesiones de usuario.
- `refreshExpiredProviderItems` (`packages/catalog`) es genérico: renueva cualquier proveedor que marque
  `metadata.providerCache.expiresAt`.

## Resolución de entidades (§6)

`EntityResolver.resolve(candidato, dataset)`:

1. IDs del candidato en `catalog_external_ids` del mismo dataset, primero los canónicos (Wikidata, IMDb,
   MusicBrainz, Open Library, ISBN, Freebase) y después los de proveedor (TMDb, Steam, Apple Podcasts…) y el ID
   propio de la fuente (`<fuente>:item:<sourceId>`).
2. Proveedores de catálogo (`CatalogProvider.resolve`), saltando los que no declaran el dataset: en desarrollo, la
   instantánea Wikidata/Commons (por IDs y, en último término, por atributos exactos); con datos reales, TMDb (solo
   por ID de TMDb o IMDb).
3. Atributos exactos en el catálogo: título normalizado igual + categoría + tipo + año (o ubicación a ≤150 m),
   y autor compatible si se conoce. Solo si hay un único candidato.
4. Creación a partir del candidato (`created_via = source:<fuente>`), sin imagen inventada: la tarjeta usa el
   fallback.

Después se añaden al objeto los IDs que aún no tenía. Un ID que pertenece a otro objeto no se mueve y queda anotado.
Bloqueos `pg_advisory_xact_lock` por ID externo evitan duplicados con syncs concurrentes. Las ediciones
(`book_edition`) atribuyen la evidencia a su obra.

## Catálogo e imágenes

- **Instantánea** `packages/catalog/data/wikidata-snapshot.json`: 108 objetos reales: 96 principales (15 restaurantes,
  13 películas, 8 series, 12 artistas, 14 juegos, 11 libros, 11 lugares y eventos culturales, 12 podcasts), 4 ediciones
  y 8 temporadas generados por `scripts/fixtures/build-catalog-snapshot.mjs` desde
  `catalog-selection.json`. Metadatos de Wikidata (CC0) y fechas con su precisión real. 82 objetos con imagen de Commons. Solo se aceptan licencias libres (dominio público, CC0, CC BY/BY-SA, GFDL, GPL), con autor, licencia y página de
  descripción.
- **Caché**: `catalog-images` descarga cada imagen una vez (User-Agent identificado, máx. 8 MB, solo tipos de
  imagen, 4/s) y la guarda en `LocalDiskStorage` (`STORAGE_DIR`, interfaz `ObjectStorage` sustituible por S3).
- **DTO**: la URL es la del archivo cacheado (`/media/catalog/...`) o, si aún no está, la de Commons. Sin imagen
  propia se usa la del padre (temporada → serie) o el **fallback de la categoría** (`/static/fallback/<cat>.svg`,
  diseño propio). La app muestra el fallback también si la carga falla.

## API (fases 0 a 3)

| Ruta | Acceso | Descripción |
|---|---|---|
| `GET /health` | Pública | BD, PostGIS, Redis y latido del worker (200/503) |
| `GET /v1/dev/users`, `POST /v1/dev/session` | Públicas solo con identidad de desarrollo | Usuarios de demo y emisión de JWT (limitada); la sesión de una cuenta local real exige su código |
| `GET /v1/me`, `PATCH /v1/me/settings` | Sesión | Usuario, perfil mínimo y ajustes (Zod estricto, ubicación redondeada) |
| `GET /v1/sources` | Sesión | Manifests: fixture (conectables solo por usuarios demo), reales disponibles o sin configurar, y previstas (no conectables) |
| `GET/POST /v1/me/connections` | Sesión | Lista y conecta. Fuentes simuladas: conexión inmediata y sync en cola. Steam y TMDb: devuelven la URL del proveedor (`ConnectStartDto`) |
| `GET /v1/connect/:source/callback/:state` (y `?state=`) | Pública, autorizada por `state` de un solo uso | Vuelta del proveedor: verifica, crea la conexión (y guarda credenciales cifradas), encola el sync y redirige a la app |
| `POST /v1/me/connections/:id/sync` | Sesión, propietario | Encola un sync `incremental` o `full` |
| `GET /v1/me/connections/:id/runs` | Sesión, propietario | Últimas 20 ejecuciones |
| `DELETE /v1/me/connections/:id?purge=` | Sesión, propietario | Desconecta, revoca en el proveedor si procede (`providerRevocation`) y, opcionalmente, borra lo importado |
| `GET /v1/catalog/items`, `GET /v1/catalog/items/:id` | Sesión | Catálogo del dataset del usuario (no son recomendaciones) |
| `GET /v1/me/item-profiles[/:itemId]` | Sesión | Perfil consolidado y evidencias **propias** |
| `GET /media/catalog/*`, `GET /static/fallback/:cat.svg` | Públicas | Imágenes del catálogo (sin datos personales; claves validadas) |

Autorización: `AuthGuard` global, `userId` siempre de la sesión y filtros por usuario en cada consulta. Un recurso
ajeno responde 404. Errores de dominio → 404/409/403/422 (`DomainErrorsFilter`). CORS solo para `localhost` fuera de
producción (vista web de desarrollo).

## App móvil

- Rutas: `(tabs)/index` (Inicio), `(tabs)/categories`, `(tabs)/people`, `(tabs)/profile`, `dev-login`, `model`
  (demo del modelo), `category/[code]` (catálogo), `item/[id]` (detalle con evidencias).
- `SessionGate` redirige a `dev-login` sin sesión. Las consultas autenticadas esperan a recuperar la sesión, y la
  sesión solo se borra si la API rechaza un token enviado.
- `CatalogImage` (expo-image) con fallback de categoría ante errores. `Dimensions` muestra Known, Consumed y
  Preference por separado, con «—» para NULL. `SourcesCard` conecta, sincroniza (incremental o completo),
  desconecta y borra, y consulta el estado de la ejecución cada 1,5 s mientras está en cola o en curso. `CreditsCard`
  (Perfil) muestra el logo y el aviso de TMDB y las fuentes de datos.
- Vista web (`pnpm --filter @appinity/mobile web`, puerto 8092) solo para verificación durante el desarrollo; usa
  `localStorage` en lugar de SecureStore.

## Pendiente por fase

Ver [progress.md](progress.md). Validación de TMDb con una cuenta real (3), Last.fm (4), afinidad (5), Top 50 (6), recomendador y Trending
(7), Home con carrusel (8), Categories con recomendaciones (9), People/Friends (10), adapters restantes (11), chat,
Premium y push (12), autenticación de producción y beta (13).

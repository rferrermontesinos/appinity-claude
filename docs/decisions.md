# Decisiones · APPINITY Claude

Registro de decisiones adoptadas, su motivo y su estado de validación. Los parámetros marcados como
**propuesta** siguen sin calibrar y no deben presentarse como validados.

## Iniciales (heredadas del paquete de partida)

- Implementación desde cero en appinity-claude, independiente de Codex. No se reutiliza su código.
- Requisitos de producto: v1.0 del 5 de octubre de 2026, conservados en APPINITY_Especificacion.md.
- Mismo stack propuesto para facilitar la comparación. Versiones verificadas y fijadas abajo.
- Servicios y datos separados de otras instalaciones (ver «Aislamiento»).
- Primera entrega limitada a fases 0 y 1, seguida de aceptación manual.
- Fórmula de afinidad, mínimos de evidencia, umbrales de votos, radio y criterio temporal de entidades
  permanentes: propuestas de la especificación, pendientes de validación.
- No se ha seleccionado hosting, contratado servicios ni configurado credenciales reales.

## Fase 0 · 2026-10-08

### Versiones (verificadas en npm el 2026-10-08 y fijadas en `pnpm-lock.yaml`)

| Pieza | Versión | Nota |
|---|---|---|
| Node.js | 24.21 (engines `>=24`) | |
| pnpm | 11.19.0 | `packageManager` en package.json |
| TypeScript | 6.0.3 | TS 7.0 existe, pero typescript-eslint 8.71 admite `<6.1`; se fija 6.0 |
| Expo SDK | 57.0.27 (`latest`) | RN 0.86.3, React 19.2.3, Expo Router 57.0.25, Reanimated 4.5.1, Gesture Handler 2.32. `expo install --check`: «Dependencies are up to date» |
| NestJS | 12.1.2 (ESM) | Express 5 |
| Drizzle ORM / kit | 0.45.3 / 0.31.11 | 0.45.4 se publicó el mismo día; pnpm 11 la marcó por edad mínima de publicación y se eligió 0.45.3 |
| pg | 8.23.1 | |
| BullMQ / ioredis | 6.3.11 / 6.0.0 | |
| Zod | 4.6.5 | |
| Vitest | 5.0.3 | |
| PostgreSQL / PostGIS | 17 / 3.5 (`postgis/postgis:17-3.5`) | |
| Redis | 7.4.7 (`redis:7.4.7-alpine`) | `maxmemory-policy noeviction`, requisito de BullMQ |

### Aislamiento respecto de otras instalaciones

| Recurso | Valor |
|---|---|
| Proyecto Docker Compose | `appinity-claude` (contenedores `appinity-claude-postgres`, `appinity-claude-redis`) |
| Volúmenes | `appinity_claude_pg`, `appinity_claude_redis` |
| PostgreSQL | `127.0.0.1:5442`, BD `appinity_claude` y `appinity_claude_test` |
| Redis | `127.0.0.1:6390`, prefijo BullMQ `appinity-claude` (tests: `appinity-claude-test`) |
| API | `0.0.0.0:3100` |
| Metro | 8091 |

En este PC había otros servicios en 3000, 5432, 5433, 6379 y 8081; se eligieron puertos libres.

### Monorepo y compilación

- **pnpm `nodeLinker: hoisted`.** Expo admite instalaciones aisladas desde el SDK 54, pero advierte de fallos
  en algunas librerías RN. En Windows el modo plano es el más fiable para Metro.
- **ESM + `tsc -b`** para todos los paquetes Node (NestJS 12 es ESM). Los paquetes se compilan a `dist/` y se
  consumen compilados, también desde Metro.
- **Sin SWC.** `@swc/core` no carga su binario en este entorno (comprobación de permisos de su caché). Los
  tests de la API importan el código compilado por `tsc`, que ya emite los metadatos de decoradores de Nest.
- **`allowBuilds` de pnpm 11:** solo `esbuild` y `msgpackr-extract` pueden ejecutar scripts de instalación.
- **drizzle-kit entrecomilla `geography(Point,4326)`**, lo que rompe el SQL. `scripts/fix-migrations.mjs` lo
  corrige tras `pnpm db:generate`. Las migraciones generadas se revisan antes de comitearlas.

### Identidad de desarrollo (no es autenticación de producción)

- JWT HS256 firmado con `DEV_AUTH_SECRET` (≥32 caracteres, generado por `pnpm setup`), emisor
  `appinity-claude-dev`, audiencia `appinity-claude-api` y caducidad de 12 h.
- Solo con `DEMO_MODE=true` y `DEV_AUTH_ENABLED=true`, prohibidos ambos con `NODE_ENV=production` (la API no
  arranca).
- Solo para usuarios `dataset = demo` y `status = active`. Un token con el `sub` de un usuario real se rechaza.
- `GET /v1/dev/users` y `POST /v1/dev/session` son públicas, pero solo existen en ese modo (404 si no).
  Cualquiera en la red local puede abrir sesión como usuario simulado; es aceptable porque solo contienen
  datos simulados.
- La autenticación de producción (Google, Apple, email) no se simula; queda para antes de la beta (fase 13).

### Datos de usuario y privacidad

- `users.dataset` (`demo` | `live`) separa los datos simulados de los reales desde el esquema.
- La ubicación se guarda como **zona aproximada**: coordenadas redondeadas a 2 decimales (~1 km) en la app y
  otra vez en la API, origen `manual` o `device`, sin historial. Columna `geography` generada para cálculos en
  metros.
- Ajustes por defecto: radio 10 km (1–50), notificaciones tres por semana, «Permitir que mis contactos me
  encuentren» activado, idioma `es`.
- El seed de demo es determinista: repetirlo restablece usuarios, perfiles y ajustes de demo.

### Navegación

Las cuatro pestañas de la especificación (Home, Categories, People, Profile) se traducen en la interfaz:
«Inicio, Categorías, Personas, Perfil» en español y sus nombres originales en inglés. Soulmates y Friends van
dentro de People; los ajustes, dentro de Profile, como propone la especificación.

### Red local y teléfono

- La app obtiene la URL de la API de `EXPO_PUBLIC_API_URL`, si no de la IP de Metro (`hostUri`) + `:3100`. Así
  funciona sin configuración si el teléfono carga la app desde la IP del PC.
- Expo Go basta: no se usan módulos nativos fuera de Expo Go. Si en el futuro hace falta un development build,
  habrá que permitir tráfico HTTP en claro hacia la LAN (Android) y explicarlo.

## Fase 1 · 2026-10-08

### Ampliaciones compatibles de los contratos de la especificación

| Contrato | Ampliación | Motivo |
|---|---|---|
| `NormalizedObservation.externalItem` | `attributes?: { releaseYear, creators, location }` | Resolver por atributos exactos sin fusionar títulos parecidos |
| `SourceAuthentication` | `'fixture'` | Las fuentes simuladas no simulan OAuth ni otro mecanismo real |
| `ProfileSourceManifest` | `availability` (`fixture`/`planned`/`available`), `simulated`, `description` | Distinguir en UI y API lo simulado, lo previsto y lo disponible |
| `ProfileSourceAdapter` | `snapshotObservationKinds?` | Saber qué evidencias forman una instantánea completa (biblioteca, escuchas) |
| `SyncBatch` | `hasMore`, `stats?` | Paginación explícita y calibración por usuario (p95) calculada sobre la instantánea |
| `CatalogProvider` | Devuelve `ProviderCatalogItem` (imagen opcional, IDs con espacio de nombres, `parentId`) | §6 permite resolver sin imagen; el fallback se aplica al publicar el DTO |
| Validación runtime adicional | `consumedConfidence ≤ knownConfidence`; `preferenceConfidence > 0` (sin confianza, NULL); `occurredAt` y `timestampPrecision` juntos | Coherencia del modelo; se valida con Zod y con constraints SQL |

### Separación demo / real

- Columna `dataset` (`demo` | `live`) en `users`, `catalog_items` y `catalog_external_ids`. La unicidad de IDs
  externos es por dataset: una importación real nunca se resuelve contra un objeto de la demo aunque comparta IMDb o
  Steam ID (probado).
- Las fuentes fixture solo se registran con `DEMO_MODE` y solo pueden conectarlas usuarios `demo`. Las reales solo
  podrán conectarlas usuarios `live`.

### Catálogo de la demo: títulos reales con imágenes libres

- Decisión del usuario (2026-10-08): títulos reales con imágenes de licencia libre, en lugar de títulos ficticios.
- Instantánea **congelada** (`packages/catalog/data/wikidata-snapshot.json`, recuperada el 2026-10-08) generada por
  `scripts/fixtures/build-catalog-snapshot.mjs`. El seed no necesita red. Regenerarla es una tarea manual
  (`pnpm fixtures:catalog`) y cambia la demo.
- Imagen: la propiedad de Wikidata más representativa (cartel P3383 en películas, logotipo P154 en series y podcasts,
  P18 en el resto), solo de Commons y con licencia libre reconocida (dominio público, CC0, CC BY/BY-SA, GFDL, GPL).
  Se descartan a mano las imágenes que no representan el objeto (foto de un acto, stand de feria, retrato del
  narrador, logotipo de otra edición): esos objetos usan el fallback.
- Las fechas conservan la precisión real de Wikidata (día, mes o año); no se inventan días.
- Las imágenes se cachean una vez en el almacenamiento propio, identificando el User-Agent y limitando a 4/s. Algunas
  miniaturas PNG de 960 px pesan más de 1 MB. **Pendiente**: generar derivados más ligeros para las tarjetas.

### Resolución de entidades (propuesta)

| Método | Confianza documentada |
|---|---|
| ID canónico exacto (Wikidata, IMDb, MusicBrainz, Open Library obra, ISBN-13, Freebase) | 1.00 |
| ID de proveedor (TMDb con tipo, Steam app, Apple Podcasts, ID propio de la fuente) | 0.98 |
| Atributos exactos: título normalizado + categoría + tipo + año (o ubicación a ≤150 m) + autor compatible, candidato único | 0.90 |
| Creación desde el candidato | — (objeto nuevo) |

Un título parecido nunca basta (probado con «Casablanca (remastered)»). El ISBN identifica una edición: la evidencia
se atribuye a la obra (`parent_item_id`).

### Consolidación v1 (`consolidation-v1`, propuesta)

- Known y Consumed: **máximo** de las evidencias, nunca suma. Tres fuentes no inflan la confianza.
- Preference: gana el nivel de mayor prioridad presente (valoración explícita > like explícito > conducta fuerte >
  asistencia > conducta débil). Dentro del nivel se toma la evidencia más reciente de cada fuente (por fecha de
  actividad; sin fecha cuenta como la más antigua) y se combinan las fuentes por media ponderada por confianza. La
  confianza resultante es la máxima. Sin preferencia, NULL.
- Conflicto: dentro del nivel ganador, fuentes con signo opuesto (|valor| ≥ 0,2) o con diferencia ≥ 1.
- Se anotan las evidencias de menor prioridad descartadas y las valoraciones sustituidas dentro de una misma fuente.
- `first_seen_at` y `last_seen_at` son fechas de **actividad** (NULL si no hay ninguna), no de sincronización.
- **Nota de calibración (fase 4):** una canción favorita (like explícito +0,6 agregado al artista) prevalece sobre
  muchas escuchas (conducta fuerte); por eso Rosalía queda en +0,6 aunque las escuchas den +1. Es coherente con la
  prioridad de la especificación, pero hay que revisarlo con datos reales de Last.fm.

### Normalización y parámetros de los mappers fixture (propuestas sin calibrar)

| Señal | Regla |
|---|---|
| Valoración 1–10 | `(r − 5,5) / 4,5`, que coincide con la normalización lineal sobre la escala real |
| Estrellas 1–5 | Lineal: 1 → −1, 3 → 0, 5 → +1 |
| Estrellas 0,5–5 | Lineal sobre la escala real: 0,5 → −1, 5 → +1 (no se aplica la de 1–10) |
| Valoración explícita | Confianza 1,0 |
| Pulgar arriba/abajo | ±0,8, confianza 0,9; conocido 1 y consumido 0 (un like no prueba consumo) |
| Visita inferida con evidencia suficiente | +1 por regla de producto, base «attendance», confianza 0,6 |
| Asistencia confirmada | +1, base «attendance», confianza 0,7 |
| Evento en calendario | Conocido 0,8, consumido 0, preferencia NULL |
| Juego con 0 min | Conocido 1, consumido 0, preferencia NULL |
| Juego con menos de 2 h | Consumido 1, preferencia NULL |
| Juego con 2 h o más | `min(1, log1p(h) / log1p(p95 del usuario))`, protegido si p95 = 0; confianza 0,6 |
| Menos de 3 escuchas de un artista | Consumido, preferencia NULL |
| 3 escuchas o más | `min(1, log1p(n) / log1p(p95 del usuario))`, confianza 0,6 |
| Canción favorita | Agregada al artista: +0,6 like explícito, confianza 0,7, con la canción y el alcance en metadatos |
| Episodios de podcast | Agregados por programa; con 3 episodios o más, preferencia logarítmica con confianza 0,5 |
| Suscripción a un programa | Conocido 1, consumido 0 (seguir no prueba escuchar) |

Con bibliotecas pequeñas, el p95 del usuario coincide casi con su máximo, así que el juego o artista principal llega a
+1. Es el comportamiento esperado de la calibración dentro de cada usuario, pendiente de validar con datos reales.

### Sync e idempotencia

- Clave idempotente `(conexión, sourceRecordId, observationKind)`. La huella de contenido (que excluye el método de
  resolución) distingue «sin cambios» de «actualizado».
- Las fuentes de eventos paginan con un cursor (desplazamiento) que solo avanza tras un sync correcto. Con errores
  parciales el cursor avanza; los registros inválidos se reintentan con «Resincronizar todo».
- Instantáneas (biblioteca de juegos, escuchas): en un sync completo **sin errores** se borra la evidencia de esos
  tipos que ya no aparece. Con errores parciales no se borra nada, por prudencia.
- Bloqueo por conexión con `pg_try_advisory_lock`. Si otro sync está en curso, la ejecución se cancela.
- Trabajos BullMQ: 3 intentos con backoff exponencial (5 s). El ID del trabajo de sync es el de la ejecución. Las
  imágenes se deduplican mientras están pendientes.

### Verificación web de desarrollo

Se añadieron `react-native-web` y `react-dom` (versiones del SDK 57) y la plataforma `web` solo para verificar
pantallas en el navegador durante el desarrollo, con CORS limitado a `localhost` fuera de producción. **No sustituye
la prueba en el teléfono** ni es un objetivo del producto. Esa verificación destapó un fallo que también afectaba al
móvil y que quedó corregido: la app cerraba sesión al arrancar porque una consulta sin token recibía 401.

### Expo Go

- SDK 57 es el estable (SDK 58 está en beta desde el 15-09-2026). Expo Go 57.0.9 en Android e iOS.
- En iPhone, Expo Go exige iniciar sesión con la misma cuenta de Expo en el teléfono y en la CLI (desde el
  03-09-2026); en Android no.
- El emulador Android de este PC tiene Expo Go 55.0.7 (probablemente lo usa otra implementación). No se actualizó
  para no alterarla, así que la app no se probó en el emulador.

## Fase 2 · 2026-10-08 (Steam)

La demo de las fases 0 y 1 fue aceptada en el teléfono por el usuario el 2026-10-08.

### Autenticación y acceso (verificado en la documentación oficial)

- **Identidad con OpenID 2.0** (`https://steamcommunity.com/openid/login`), no OAuth: el usuario inicia sesión en
  Steam y APPINITY recibe solo el SteamID. Antes de crear la conexión se verifica la respuesta: modo `id_res`,
  endpoint de Steam, `return_to` exacto (incluye un `state` de un solo uso guardado 10 min en Redis y ligado al
  usuario), Claimed ID con SteamID64, campos firmados obligatorios, nonce de 5 min como máximo y
  `check_authentication` contra Steam.
- **Datos con la Steam Web API** y una clave de usuario del propietario del servidor (`STEAM_WEB_API_KEY`, solo en
  `.env`). No hay tokens por usuario: `source_credentials` sigue vacía. La clave viaja como parámetro `key` (forma
  documentada en la Web API); nunca aparece en mensajes, logs ni respuestas.
- El SteamID64 se trata siempre como **texto** (supera 2^53).
- Un SteamID no puede estar vinculado a la vez a dos usuarios (índice único parcial). Al revocar se olvida.
- La URL de vuelta a la app está en lista blanca (`appinity-claude://`, `exp://` en IP privada, `localhost` en web)
  para evitar redirecciones abiertas.

### Cuenta local real (identidad de desarrollo para datos reales)

- La regla de la fase 0 («la identidad de desarrollo nunca actúa como un usuario real») se amplía de forma
  controlada: probar Steam con la cuenta real del usuario exige un usuario `dataset = live`, y la autenticación de
  producción no llega hasta la fase 13.
- `pnpm user:local` crea o regenera una cuenta `live` con un código aleatorio (12 caracteres, mostrado una sola vez,
  guardado con scrypt). La sesión exige handle y código. El token lleva una huella del código vigente, así que
  regenerarlo invalida las sesiones abiertas. Solo con `DEMO_MODE` y fuera de producción. Las cuentas locales no
  aparecen en la lista de usuarios de demo. Sigue sin ser autenticación de producción.
- Los usuarios reales solo pueden conectar fuentes reales y los de demo solo simuladas (se mantiene la separación de
  datasets). La app muestra «DATOS REALES · cuenta local de desarrollo» en lugar del aviso de demo.

### Sync y normalización de Steam (`steam-v1`, propuesta sin calibrar)

- Instantánea completa (GetPlayerSummaries + GetOwnedGames; sin paginación ni historial): una observación por juego
  (`library`, `app:<appid>`) actualizada en cada sync; lo que sale de la biblioteca deja de ser evidencia si el sync
  fue completo y sin errores.
- Reglas iguales a la fuente simulada de juegos: 0 min = conocido sin consumo ni preferencia; menos de 2 h =
  consumido sin preferencia; desde 2 h, `min(1, log1p(h) / log1p(p95 del usuario))` con confianza 0,6.
  `occurredAt` = última partida (instantánea), nunca la fecha de sync.
- Si falta el nombre se usa «Steam app <appid>» con `nameUnavailable` en metadatos (no se inventa un título).
- Biblioteca no visible (`{"response":{}}`): error `profile_inaccessible` no reintentable, conexión en «error» con la
  instrucción (Privacidad → Detalles de juegos: Público) y **sin borrar** evidencia. Con la propia clave de la cuenta,
  Steam devuelve la biblioteca aunque sea privada.
- Límites: el cliente reintenta 429/5xx/red hasta 3 veces (backoff exponencial desde 1 s, respeta `Retry-After` hasta
  30 s) y después reintenta el trabajo BullMQ. Los errores no reintentables usan `UnrecoverableError` para no gastar
  llamadas. Cada sync hace 2 llamadas; el límite diario es de 100.000.
- **Syncs programados**: el worker revisa cada hora (`upsertJobScheduler`) y encola las conexiones de fuentes reales
  `scheduled`/`full-refresh` activas cuyo último sync supera `SYNC_INTERVAL_HOURS` (24 h) y sin otro sync pendiente.
  Las fuentes simuladas no se programan.

### Imágenes de Steam

- La cápsula 600×900 del CDN de Steam no está documentada en la Web API y los Terms no autorizan expresamente a
  redistribuir el arte: se guarda **solo como referencia** (`restrictions = reference-only`, `licenseUrl` = Terms) y
  nunca se cachea (`CACHEABLE_IMAGE_SOURCES` = solo Wikimedia Commons). Si no carga, la app muestra el fallback.
- Si el objeto ya tiene imagen libre (instantánea de Wikidata), se mantiene; la de Steam solo se añade como referencia
  cuando no hay ninguna.

### Catálogo para datos reales

- En desarrollo (`DEMO_MODE`), la instantánea de Wikidata también actúa como proveedor de catálogo para objetos
  reales. Sus datos son reales (Wikidata CC0, Commons con licencia), pero los objetos se crean en el dataset `live`:
  nunca se reutilizan los de la demo. Sin `DEMO_MODE` no se carga, y los juegos se crean desde la propia fuente.
- Las fechas de lanzamiento de Steam no las da la Web API; quedan pendientes para Trending (fase 7).

### Credenciales sin pasar por el chat

`pnpm secret:set STEAM_WEB_API_KEY` pide el valor en la terminal sin mostrarlo, valida el formato (32 caracteres
hexadecimales) y lo escribe en `.env`. Alternativa: editar `.env` a mano.

### Onboarding y sincronización automática (observación del usuario)

Tras validar Steam con su cuenta (2026-10-08), el usuario pidió que la sincronización sea automática y que el usuario
final solo tenga que dar permisos una vez, al registrarse. Estado y plan:

- **Ya es automático:** el primer sync se lanza solo al conectar y después el worker sincroniza cada 24 h
  (`SYNC_INTERVAL_HOURS`). El botón «Sincronizar» es opcional.
- **Los pasos extra de la prueba eran de desarrollo y no existirán para el usuario final:** la clave de la Web API la
  configura una sola vez quien opera el servidor (no el usuario); la cuenta local y su código se sustituyen por la
  autenticación de producción (fase 13); arrancar servidores no es un paso de producto.
- **Pendiente de diseño (onboarding, §14 y fase 13):** la pantalla «Conecta tu mundo» del registro ofrecerá las fuentes
  disponibles; el usuario autoriza cada una una vez (consentimiento por proveedor) y no vuelve a ver pasos de sync. Se
  podrá revisar más adelante, como indicó el usuario.

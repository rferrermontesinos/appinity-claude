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

## Revisión de fuentes · 2026-10-08

Detalle y evidencias en [fuentes-de-datos.md](fuentes-de-datos.md); requisitos en la especificación 1.1 (§9 y §14).

### TMDb descartada

La fase 3 (TMDb) se implementó en la rama `fase-3` (PR rferrermontesinos/appinity-claude#4) y se descartó antes de
validarla con la cuenta real: las condiciones de TMDb solo permiten el uso gratuito no comercial, y APPINITY tendrá
Premium. La PR se cerró sin fusionar y el trabajo continúa desde `fase-2`.

La rama se conserva porque contiene piezas genéricas reutilizables para fuentes OAuth:
- credenciales por usuario cifradas (AES-256-GCM, AAD = conexión);
- `state` del callback en la ruta;
- revocación en el proveedor al desconectar (`providerRevocation`);
- renovación de contenido cacheado con caducidad.

No había datos de TMDb en la base de datos local.

### Criterio comercial para fuentes y catálogo

Una fuente o un proveedor de catálogo solo se implementa si sus condiciones permiten el uso comercial de APPINITY sin
acuerdo previo, o con el acuerdo firmado. Por este criterio:
- **Last.fm** (antigua fase 4) también queda condicionada: su licencia es no comercial y lo comercial se negocia con
  partners@last.fm.
- **Spotify** queda bloqueada hasta tener escala: desde el 15/05/2025 el acceso ampliado es solo para empresas con
  ≥ 250.000 usuarios activos al mes, y el modo desarrollo admite 5 usuarios.

### Permisos solo en el registro

Petición del usuario: el usuario final no introduce tokens ni da más permisos que los del registro. Se adopta como
requisito (§9 y §14):
- un consentimiento oficial por proveedor;
- sin claves, códigos, nombres de usuario ni archivos;
- syncs automáticos.

Excepción declarada: la renovación que imponga el proveedor (Google Data Portability, como máximo cada 180 días), con
un aviso de un toque y sin perder lo importado.

### Google Data Portability como fuente principal (fases 3 y 4)

Un solo consentimiento de Google da:
- valoraciones explícitas (estrellas, pulgares, «visto») de películas, series, libros, música y videojuegos;
- reseñas con estrellas y guardados de Maps;
- actividad de YouTube y YouTube Music;
- datos de Play y de reservas con Google.

Cubre las ocho categorías y está disponible en España.

Riesgos declarados:
- disponible solo en la UE, Suiza y Reino Unido, y para mayores de 18 años;
- verificación de Google anual y auditoría CASA si hay scopes restringidos (coste orientativo de 540 a 4.500 USD al año);
- la política limita el uso aprobado a apps cuya función principal es trasladar datos; el encaje de APPINITY se
  confirmará en la verificación;
- la escala y las fechas de las valoraciones de la Búsqueda se verificarán con un export real.

En desarrollo basta un proyecto de Google Cloud en modo de pruebas con usuarios de prueba.

Orden: fase 3, valoraciones y lugares (explícitas); fase 4, YouTube y YouTube Music (frecuencia de escucha, en lugar
de Last.fm).

### Gmail en evaluación

Sería la vía para pedidos, reservas y entradas de servicios sin API (Glovo, Just Eat, TheFork, DICE, RA) y para las
compras de juegos de consola. Queda fuera del MVP hasta una evaluación legal y de coste:
- permiso restringido con auditoría anual;
- usos permitidos limitados;
- es el permiso más invasivo para el usuario.

### Catálogo audiovisual

Sin TMDb, películas y series se apoyan en Wikidata (CC0), imágenes libres de Commons y TVmaze (CC BY-SA, con crédito).
Muchas tarjetas de cine usarán la imagen de sustitución hasta decidir si se licencia un catálogo comercial (decisión de
negocio pendiente).

**Decisión del usuario (2026-10-09):** de momento, imagen genérica (sin licencia de catálogo audiovisual). Gmail se
evaluará más adelante.

## Fase 3 · 2026-10-09 (Google Data Portability: valoraciones y lugares)

Ficha en [integration-capabilities.md](integration-capabilities.md#google-data-portability--fase-3-valoraciones-y-lugares).

### Condiciones de Google que cambian el diseño

- **Sin identidad de la cuenta.** Los scopes de Data Portability no se pueden mezclar con openid ni email, así que la
  conexión no guarda cuenta externa (no se puede impedir que dos usuarios vinculen la misma cuenta de Google).
- **Sin identificadores en los datos.** La Búsqueda solo da el texto buscado («Moana») y Maps no da la categoría del
  lugar: cada registro se **identifica** en el catálogo antes de crear evidencia (ver abajo).
- **Cuenta de facturación obligatoria** en el proyecto de Google Cloud, aunque la API no tenga precio publicado. Es una
  decisión del titular; la app no contrata nada.
- **Desarrollo:**
  - Google solo admite URLs de vuelta `http` con `localhost`. El consentimiento se hace desde la vista web del PC, y en
    el teléfono la app lo explica en vez de abrir un flujo que no volvería.
  - En modo Testing el permiso dura 7 días; después la conexión pide «Renovar permiso».
  - En producción, la URL de vuelta será el dominio HTTPS de la API y la duración, la que elija el usuario (hasta
    180 días).
- **Scopes mínimos:** solo los 5 grupos que se importan. `saved.collections` y YouTube quedan para la fase 4.

### Exports asíncronos

- Un export por grupo, como recomienda Google.
- El id del trabajo se guarda **cifrado antes de esperar**: un acceso único no se puede repetir y un trabajo perdido no
  se recupera.
- Mientras Google prepara el archivo, el sync devuelve `pending`. El runner deja la ejecución en cola y el worker la
  reprograma con `moveToDelayed` (1 min, 5 min, 15 min, 1 h según lo transcurrido; Google recomienda 5–60 min) sin
  gastar reintentos. Pasados 7 días se abandona.
- Contratos nuevos (ampliación compatible): `SyncContext.saveState`, `SyncBatch.pending`, `SyncBatch.snapshotKinds` y
  `SyncPartialError.blocking`.
- **Instantánea por grupo:** solo se retira evidencia de los grupos exportados en ese sync. Si un grupo no toca (24 h)
  o era de acceso único, su evidencia se conserva.
- Riesgo aceptado: el export se marca como hecho al descargarlo; si después fallara la escritura en la base de datos,
  con acceso único no podría repetirse hasta renovar.

### Identificación (propuesta, confianzas sin calibrar)

- **Lugares → OpenStreetMap (Overpass).** Elementos a ≤ 100 m de las coordenadas exportadas, clasificados por
  etiquetas:
  - restaurante, bar, café… → food;
  - museo, galería, teatro, cine, monumento patrimonial… → culture.

  Coincidencia de nombre:
  - idéntico tras normalizar: 0,95;
  - sin palabras genéricas («Restaurante Can Culleretes» = «Can Culleretes»): 0,85;
  - nombre de Google contenido como frase en el de OSM, con al menos dos palabras y candidato único: 0,75;
  - si hay varios candidatos por contención, solo el único con Wikidata: 0,7.

  Categorías distintas entre candidatos → no se identifica. Se guardan `osm:<tipo>` y, si existe, `wikidata:entity`.
  OSM es ODbL: atribución en «Créditos y fuentes de datos». La instancia pública admite unas 10.000 consultas al día por
  aplicación; para producción, instancia propia o de pago.
- **Obras → Wikidata (CC0).** Etiqueta o alias idéntico al título buscado, en español e inglés, y tipo (P31) reconocido
  (película, serie, videojuego, libro, grupo o persona músico).
  - Candidato único: 0,8.
  - Si hay varios, solo el que tenga al menos el doble de enlaces a Wikipedias que el siguiente: 0,65.
  - Un disco o canción se atribuye a su único intérprete (× 0,9).
- **Consultas por lotes a Overpass** (comprobado el 2026-10-09 en `/api/status`). Hechos medidos:
  - El balanceador alterna dos servidores, con 4 y 2 huecos por IP.
  - Cada consulta bloquea su hueco unos 60 s aunque dure 5 s.
  - Con carga, devuelve 504 a menudo.

  Decisiones:
  - Hasta 25 lugares por consulta, con un separador `make sep i=<n>` entre los resultados de cada lugar.
  - Reintentos ante 429 o 504 a los 15 s, 30 s, 60 s y después cada 2 min (o lo que pida `/api/status`).
  - Si OSM o Wikidata no responden en ~10 min, el sync se aplaza 10 min, no falla.

  Nominatim se descartó como alternativa: su política trata los usos periódicos como geocodificación masiva (máx.
  4 peticiones/min) y pide no enviarle datos personales. Las instancias alternativas de Overpass (private.coffee,
  maps.mail.ru) respondieron 500 o 504 el mismo día. Para producción hará falta una instancia propia o de pago.
- **Cierre del worker.** Con Ctrl+C el worker deja de pedir trabajos y devuelve los syncs en curso a la cola, en vez de
  esperar a que terminen. Los syncs son idempotentes y el bloqueo por conexión se libera al salir.
- **Lo ambiguo no se importa.** Se informa con un error parcial no bloqueante, como «12 de 40 … no se pudieron
  identificar con seguridad». Nunca se fusiona por un título parecido (§6).
- **Lo que APPINITY no usa se explica aparte** (tras el primer sync real: 20 de 75 reseñas identificadas). La consulta a
  Overpass trae todos los lugares con nombre y alguna clave de comercio o servicio (`amenity`, `shop`, `tourism`,
  `leisure`, `historic`, `heritage`, `craft`, `office`, `club`, `healthcare`), no solo restaurantes y cultura.
  - Si lo que mejor coincide no es de APPINITY, la reseña queda **fuera de categoría**, con una etiqueta genérica
    (alojamiento, tienda, mercado, parque…), aunque un restaurante coincida peor. A igual coincidencia gana el
    elemento de APPINITY (un restaurante y su edificio protegido con el mismo nombre).
  - Los elementos sin esas claves (estaciones, calles) se ignoran aunque se llamen igual.
  - El aviso separa «fuera de las categorías de APPINITY» de «no se pudieron identificar con seguridad». El worker
    muestra el desglose por etiqueta, sin nombres.
  - Monumentos: se añade `tourism=artwork` con `historic`/`heritage` (Casa Batlló).
  - Se descartó ignorar partículas («de», «del»): hacía que «Museu de la Sagrada Família» ganara a la basílica.
- **Nombre parecido muy cerca (2026-10-13).** En el tercer export real, 26 de los 47 lugares sin coincidencia tenían un
  restaurante o lugar cultural a ≤ 30 m con otro nombre. Nueva regla, la de menor confianza (0,6): a ≤ 30 m, de las
  categorías de APPINITY, con Jaccard ≥ 0,5 entre las palabras significativas de ambos nombres y único candidato (si
  hay varios, ambiguo). Una sola palabra suelta en común no basta («Picasso» ↔ «Fundació Picasso Barcelona»).
- La confianza de la identificación **multiplica** las de conocido, consumido y preferencia. Así una identificación
  dudosa pesa menos y no oculta el objeto en Home (umbral 0,8).
- Comprobación en vivo (2026-10-09):
  - OSM identificó Museu Picasso (0,95), Can Culleretes (0,95) y la Basílica de la Sagrada Família (0,7, por
    contención); las estaciones de metro homónimas se descartan.
  - Wikidata identificó Breaking Bad, Casablanca, Moana (película de 2016), Radiohead, OK Computer → Radiohead, Hades y
    Cien años de soledad.

### Normalización (`google-portability-v1`, propuesta sin calibrar)

| Registro | Conocido | Consumido | Preferencia |
|---|---|---|---|
| Reseña de Maps con estrellas | id | id | (r − 3) / 2, `explicit_rating`, confianza id |
| Reseña de Maps sin estrellas | id | id | NULL |
| Sitio guardado en Maps | id | 0 | NULL |
| Estrellas en la Búsqueda | id | id | (r − 3) / 2, `explicit_rating` (escala 1–5 por confirmar con un export real) |
| Pulgar arriba / abajo | id | 0,7 × id | ±0,8, `explicit_like`, confianza 0,9 × id |
| Marcada como vista | id | id | NULL |

`id` = confianza de la identificación. `occurredAt` es la fecha del registro («Updated» o «Published»; en Maps, `date`),
de modo que las reseñas de Maps aportan votos fechados para Trending local. El texto de las reseñas no se guarda.

### Renovación sin perder datos

Las fuentes con `supportsRenewal` (Google) admiten una nueva autorización sobre una conexión abierta. Se sustituyen las
credenciales cifradas, se actualizan los scopes del consentimiento, se reactiva la conexión y se conserva la evidencia.
El siguiente sync la actualiza como instantánea.

### Piezas genéricas recuperadas de la rama fase-3 (TMDb)

- Credenciales por usuario cifradas en la conexión.
- `state` en la ruta del callback; también se admite `?state=`, que es la forma que usa Google.
- Revocación en el proveedor con `providerRevocation`.
- Revocación de credenciales huérfanas.
- `pending` del flujo en Redis.
- `datasets` en los proveedores de catálogo.

## Fase 4 · 2026-10-13 (YouTube y YouTube Music por Data Portability)

El usuario autorizó continuar con las siguientes fases sin esperar a su revisión (2026-10-13). Decisiones:

- **Mismo adapter y mismo consentimiento.** Los grupos `myactivity.youtube`, `youtube.music` y
  `youtube.subscriptions` se añaden al consentimiento de Google (8 grupos). Sigue la especificación (§9: «el mismo
  consentimiento de Google») y la regla de permisos mínimos (solo se piden grupos que se importan).
- **Política.** La de Data Portability no menciona YouTube; su único caso de uso aprobado es trasladar datos. Es el
  bloqueo de producción ya declarado en la fase 3, no uno nuevo. En desarrollo se usa como en la fase 3.
- **Reproducción = URL `/watch?v=` con canal y sin `details`.** Los títulos de Mi actividad se traducen al idioma de la
  cuenta («Watched…», «Has visto…»); los anuncios llevan `details`. No se guardan títulos de vídeos ni búsquedas.
- **Identificación de canales por P2397 (ID de canal de YouTube en Wikidata, CC0).** Es un identificador exacto, no un
  título parecido (§6): confianza 0,95. La búsqueda `haswbstatement:P2397=A|P2397=B…` admite varios canales a la vez
  (comprobado en vivo el 2026-10-13: Radiohead, The Beatles, Queen, The Joe Rogan Experience y 99% Invisible).
  - Solo artistas musicales (grupos o personas con ocupación musical) y podcasts (P31 = Q24634210). Un youtuber o una
    marca quedan fuera de categoría.
  - Canales autogenerados «Artista - Topic» (o escuchados en YouTube Music) que no estén en Wikidata: artista por
    nombre exacto, solo músicos, 0,8 si es único y 0,65 si domina en enlaces. No se le atribuye el ID del canal.
  - Las etiquetas de Wikidata se leen también en el idioma común `mul`: muchas personas solo tienen ahí su nombre
    (detectado en vivo con Bad Bunny).
- **Agregación por artista o programa (§6).** Los canales de una misma entidad se fusionan (oficial + «Topic»). Una
  observación por artista y tipo: `yt_plays`, `yt_subscription` y `ytm_library`.
- **Normalización (propuesta sin calibrar, §5 y §9):**
  - escuchas → consumido; desde 3 escuchas, `min(1, log1p(n) / log1p(p95))` con el p95 del propio usuario en esa
    categoría (música y podcasts por separado), confianza 0,6 × identificación, base `strong_behavior` (igual que
    las horas de Steam). Con menos de 3, preferencia NULL: una escucha aislada confirma consumo, no gusto;
  - suscripción → conocido sin consumo (tabla de §5: «artista o podcast seguido o suscrito»);
  - biblioteca de YouTube Music → guardado: conocido sin consumo (§9: «Biblioteca → guardado»).
- **Límites:** se identifican como máximo los 400 canales más escuchados, 400 suscripciones y 300 artistas de la
  biblioteca. Lo que queda fuera se informa («N con menos escuchas no se consultaron»).
- **Historial completo en cada export** (sin `startTime`): la agregación necesita todas las escuchas y la instantánea
  retira lo que desaparece. Se revisará si el tamaño real del export lo exige.
- **Permisos nuevos sobre conexiones existentes.** El adapter declara `requestedScopes`; la API devuelve
  `missingScopes` por conexión y la app invita a renovar el permiso. Renovar conserva lo importado.
- **Primer export real de YouTube (2026-10-13).** 34.293 reproducciones válidas en 11.861 canales (descartados 9.764
  anuncios, 5.755 registros que no son reproducciones y 4.129 vídeos sin canal). De los 394 canales más escuchados se
  identificaron 42, 57 quedaron fuera de categoría y 301 sin coincidencia. Biblioteca de YouTube Music vacía en esa
  cuenta; 9 suscripciones (1 identificada). Cambios:
  - un artista o podcast también se reconoce por tener un ID en MusicBrainz, Spotify, Apple Music o Discogs (P434,
    P1902, P2850, P1953) o en Apple Podcasts o Spotify (P5842, P5916), aunque su tipo u ocupación no estén en la lista;
  - el worker indica cuántos canales sin coincidencia se buscaron además como artista por nombre, para distinguir
    canales de música no reconocidos de canales que no son de música.
- **Segundo export de YouTube (2026-10-14).** 46 canales identificados (antes 42). De los 311 sin coincidencia, solo 20
  se escucharon como música (se buscaron también como artista); el resto son canales que no son de música ni están en
  Wikidata. La identificación musical no es el cuello de botella. Maps: 33 de 75 (antes 21) gracias a la regla de nombre
  parecido a ≤ 30 m.
- **Wikidata más tolerante.** En ese sync, Wikidata falló cuatro veces seguidas y cada fallo aplazó todo 10 minutos. El
  cliente pasa de 3 intentos (~7 s) a 6 (2, 4, 8, 16 y 32 s, o lo que pida Retry-After), trata como pasajeros los
  errores `search-error` y de tiempo de consulta que llegan con HTTP 200, y avisa de cada espera en el worker.
- **Sin autorización incremental (comprobado con la cuenta real el 2026-10-13).** Al renovar con los grupos de YouTube,
  Google respondió `Error 400: invalid_request` · «Incremental auth is not allowed for the requested scopes». La
  documentación no lo trata. Solución: si la conexión no tiene todos los permisos que se piden, antes de redirigir se
  libera la concesión vigente (`authorization:reset` y revocación del token), se borran sus credenciales y la conexión
  queda «requiere acción» hasta completar el consentimiento con los 8 grupos. Lo importado se conserva. Si el
  usuario abandona el consentimiento, la conexión sigue en ese estado y puede volver a intentarlo.

## Fase 5 · 2026-10-13 (afinidad direccional versionada)

Motor `affinity-v1` en `packages/algorithms/src/affinity.ts`: la fórmula V1 de §11, con un cambio de calibración
documentado aquí.

- **Solo preferencias consolidadas.** Conocido o consumido sin preferencia no entra. Peso por objeto:
  `w = min(confA, confB)`.
- **Parámetros (sin calibrar con usuarios reales):**

  | Parámetro | Valor | Motivo |
  |---|---|---|
  | tau | food 4, culture 3, movies 6, series 4, music 5, games 4, books 4, podcasts 2 | Evidencia efectiva con la que el factor de evidencia llega al 63 %. Mayor en categorías donde la gente acumula más objetos (películas) |
  | Mínimo comparable | 2 objetos y Σw ≥ 1 | Con 1 solo objeto, NULL |
  | Suelo de confianza de datos | 0,75 | Ver calibración |
  | Elegibilidad | Activo, no borrado, mayoría de edad confirmada y ≥ 3 preferencias | Mínimo de evidencia documentado (§4) |

- **Calibración (perfiles sintéticos; tabla generada con el motor el 2026-10-13):**

  | Escenario | Fórmula literal §11 | `affinity-v1` |
  |---|---|---|
  | Gustos idénticos, 20 valoraciones explícitas (películas) | 96,4 | 96,4 |
  | Gustos idénticos, 12 juegos inferidos por horas (confianza 0,6) | 50,1 | 75,1 |
  | Idénticos, 2 valoraciones | 28,4 | 28,4 |
  | Idénticos, 5 valoraciones | 56,5 | 56,5 |
  | Contrarios, 10 valoraciones (+1 frente a −1) | 0 | 0 |
  | A con 200 películas, B con 10 en común idénticas (A → B) | 68,5 | 68,5 |
  | El mismo caso, B → A | 81,1 | 81,1 |
  | 8 restaurantes, acuerdo parcial (1 frente a 0,5) | 64,8 | 64,8 |

  La fórmula literal multiplica tres veces la confianza de los datos: en n_eff (y por tanto en el factor de evidencia),
  en el peso del acuerdo y en `dataConfidence`. Así, dos personas con gustos idénticos inferidos de conducta no
  pasaban del ~50 % aunque tuvieran mucha evidencia. Es lo que §11 pide documentar. `affinity-v1` usa
  `dataConfidenceFactor = 0,75 + 0,25 · media(w)`: con datos explícitos (confianza 1) no cambia nada; con conducta
  sigue penalizando, pero menos. Con `dataConfidenceFloor = 0` se obtiene la fórmula literal (queda en los tests).
- **Global:** media ponderada de las categorías con resultado; las que faltan no cuentan como 0. Peso:
  `log1p(Σ confianzas de las preferencias del usuario de origen en la categoría)`. Cada objeto cuenta una vez, así
  que miles de escuchas no duplican el peso de una preferencia. Confianza global: `1 − Π(1 − confianza de cada
  categoría)`. Varias categorías comparables la aumentan.
- **Almacenamiento:** `user_affinities` y `category_affinities` por pareja ordenada, con `algorithm_version` y
  `computed_at`. NULL = sin fila (nunca un 0 inventado). No se guarda qué objetos coinciden.
- **Prefiltro exacto:** solo se calculan parejas que comparten algún objeto con preferencia. Sin objetos en común todo es
  NULL, así que no pierde candidatos; un test lo compara con el cálculo exhaustivo.
- **Separación de datasets:** la demo y las cuentas reales nunca se comparan entre sí.
- **Cuándo se recalcula:**
  - tras un sync con cambios: trabajo `affinity` del usuario, agrupado 10 s;
  - tras borrar lo importado de una fuente;
  - cada 24 h, completo;
  - al terminar `pnpm db:seed`.

  Nunca al abrir la app (§11).
- **API:** `GET /v1/me/affinities/:userId` devuelve solo la dirección «yo → otra persona»: global, las 8 categorías
  (NULL donde no hay datos) y si la afinidad mutua es excepcional (ambas ≥ 90). De la dirección inversa solo se expone
  ese booleano. Solo entre personas del mismo dataset.
- **Pendiente:** bloqueos (fase 10) y ajustes de privacidad de descubrimiento. Calibrar tau y mínimos con datos reales.

## Fase 6 · 2026-10-13 (Top 50 de almas gemelas)

- **`affinity-v2` (cambio de calibración de la global).** Al construir el ranking de la demo apareció un caso que
  `affinity-v1` resolvía mal:

  | Persona | Coincidencias de Laura | v1 | v2 |
  |---|---|---|---|
  | Clara | 11 objetos en 4 categorías, acuerdo total | 40,9 | 85,9 |
  | Teo | 4 películas, acuerdo total | 48,7 | 48,7 |

  v1 promediaba las cifras de categoría, y cada una ya incluye su propio factor de evidencia. Así la evidencia
  repartida en varias categorías se penalizaba dos veces. v2 promedia la **calidad** del acuerdo (acuerdo × cobertura ×
  confianza de datos, ponderada por la profundidad del historial de origen) y la multiplica por un factor de evidencia
  que **suma** la de todas las categorías, cada una en sus unidades (`Σ n_eff_c / tau_c`). Consecuencias:
  - con una sola categoría, la global coincide exactamente con su cifra (las tablas de calibración de la fase 5 no
    cambian);
  - una categoría sin datos sigue sin contar como 0;
  - la cifra por categoría no cambia;
  - confianza global = factor de evidencia × confianza media de los datos.

  Se sube la versión del algoritmo; las filas guardadas con `affinity-v1` se sustituyen en el siguiente recálculo.
- **Ranking:** `topSoulmates` lee las afinidades guardadas (no calcula al abrir la app). Orden estable: afinidad,
  confianza, objetos en común e id. Versión gratuita: 50. Si hay menos candidatas, se devuelven las que existan.
  Comprobado contra el cálculo exhaustivo con 12 y 70 perfiles sintéticos.
- **Elegibilidad al leer:** activa, no borrada, mayoría de edad confirmada, mismo dataset y sin bloqueo en ninguna
  dirección. El mínimo de evidencia (≥ 3 preferencias) lo aplica el cálculo.
- **Bloqueos:** tabla `user_blocks` (migración `0005`). Excluyen en ambas direcciones del ranking, del perfil y de la
  afinidad (404). Bloquear y desbloquear desde la app llega con la fase 10.
- **Perfil público mínimo** (`GET /v1/people/:id`): nombre, país, foto y las afinidades (global y 8 categorías, NULL como
  raya). Ningún objeto, título ni historial. De la dirección inversa solo se expone el indicador de afinidad mutua
  excepcional.
- **Personas sintéticas de la demo:** 7 personas nuevas (Clara, Pau, Iris, Leo, Ona, Teo y Vera) cuya actividad se
  **deriva** de forma determinista de la de las personas existentes (`personas.ts`):
  - mismas notas, parecidas, opuestas o solo tres registros;
  - mismos objetos reales del catálogo y valoraciones inventadas;
  - pasan por el mismo pipeline que el resto.

  Así el ranking de la demo tiene casos variados sin escribir cientos de registros a mano.
- **Pendiente:** ajuste de privacidad «aparecer en almas gemelas» (no existe todavía; solo
  `discoverableByContacts`, que es para contactos) y exploración Premium más allá de 50 (fase 12).

### Decisión del usuario · affinity-v3 (2026-10-13)

> «Las no coincidencias no deberían penalizar. Solo deberían contabilizar las coincidencias en positivas y en
> negativas. Si Laura ha votado negativamente un restaurante pero Sam no lo conoce, el % de afinidad no debería verse
> afectado.»

- Se elimina el factor de cobertura de §11 (`0,80 + 0,20 · √(|C| / N_A)`). La cobertura se sigue guardando como dato
  informativo, sin efecto en la cifra.
- La global pondera cada categoría por la evidencia en común (`log1p(n_eff_c)`), no por todo el historial de quien
  consulta.
- **Consecuencia: la afinidad es simétrica** (A → B = B → A). §4 y §11 la describen como direccional porque la cobertura
  dependía del historial de origen; con esta decisión desaparece esa diferencia. Se mantienen las filas por pareja
  ordenada (no cuesta nada y permite volver a una variante direccional sin migrar). «Afinidad mutua excepcional» queda
  como afinidad ≥ 90.
- Se conservan: NULL sin objetos en común suficientes, 0 con desacuerdo real, el factor de evidencia (pocas
  coincidencias no dan cifras altas) y el suelo de confianza de datos.
- Demo con v3: Laura ↔ Clara 85,94; Teo 48,66; Jordi 23,62 (antes 22,24 y 22,76 según el sentido); Pau 22,95. Marta ↔
  Iris 76,88.

## Fase 7 · 2026-10-14 (recomendador y Trending local)

Motor `recommendation-v1` (`packages/algorithms/src/recommendation.ts` y `packages/ingestion/src/recommendations.ts`).
Se calcula al pedirlo, a partir de perfiles y afinidades ya guardados. No hace falta tabla de candidatos con el tamaño
actual.

- **Consenso (70 %)**:
  - solo el Top 50 de almas gemelas; una persona = un voto;
  - apoyo = preferencia ≥ 0,5 con confianza ≥ 0,5; mínimo 2 apoyos (con uno solo es descubrimiento, no consenso);
  - puntuación = (apoyos / almas gemelas con opinión) · (1 − e^(−apoyos/3)) · preferencia media de los apoyos ·
    confianza media. Se conservan apoyos y denominador.
- **Descubrimiento (20 %)**:
  - persona con afinidad ≥ 50 (la de la categoría si existe; si no, la global);
  - gusto ≥ 0,8 con confianza ≥ 0,7;
  - puntuación = afinidad/100 · preferencia · confianza;
  - se registra quién lo aporta, y su nombre es el motivo («Descubierto a través de…»).
- **Trending (10 %)**:
  - votantes: personas del mismo dataset, activas y adultas, sin bloqueos, cuya ubicación está dentro del radio del
    destinatario (PostGIS en metros); la afinidad no interviene;
  - voto: valoración explícita (rating o like) consolidada, confianza ≥ 0,8, con una observación explícita cuyo
    `occurred_at` cae en el año actual del destinatario (zona horaria del usuario; con precisión de año, en UTC).
    Nunca `synced_at`;
  - reglas de fecha: películas, series, libros y videojuegos, estreno en el año actual; eventos, en el año actual;
    restaurantes, lugares, artistas y podcasts, sin regla de creación;
  - lugares dentro del radio;
  - ranking: media bayesiana (prior 0, peso 3) con votos altos y bajos, mínimo 5 votantes únicos, mitad o más de
    votos altos (≥ 0,6) y media ≥ 0,3. Se guardan votos altos, totales, media, año y radio.
- **Mezcla**: tandas de 10 (7/2/1). Si un bloque no tiene candidatos, su hueco lo ocupa otro bloque (consenso →
  descubrimiento → trending) marcado con `fillsFor`. El motivo sigue siendo el real de la tarjeta. Nunca se inventan
  apoyos ni se llama Trending a otra cosa.
- **Filtros**:
  - conocidos (knownConfidence ≥ 0,8);
  - descartes de Home (tabla `home_dismissals`, migración 0006; la gestión llega en la fase 8). Categories no los
    aplica;
  - objetos ya mostrados en la sesión (`exclude`);
  - lugares fuera del radio;
  - eventos terminados.
- **Sin ubicación**: no se recomiendan lugares (no se presume ninguna ciudad) y no hay Trending local
  (`no_location`).
- **Demo**: las personas sintéticas pueden combinar la actividad de varias personas (Clara = Laura + series de Núria +
  restaurantes de Marta). Si dos personas de origen valoraron el mismo objeto, vale la primera receta. Así la demo
  tiene recomendaciones y el seed sigue siendo idempotente.

## Fase 8 · 2026-10-14 (Home)

- **Tablas** (migración 0007):
  - `recommendation_impressions`: primera y última vez mostrada, y veces;
  - `recommendation_actions`: descartar o conservar, con `undone_at`.

  Junto con `home_dismissals` (fase 7), solo deciden qué se muestra en Home. Ninguna toca gustos ni afinidades; un test
  lo comprueba.
- **NEW** = APPINITY nunca había mostrado ese objeto a esa persona (no es «estreno»). La impresión se registra cuando la
  tarjeta pasa a ser la primera del mazo, no al precargarla. Deshacer no borra impresiones.
- **Descartar** persiste: el objeto no vuelve a Home, ni tras reiniciar. **Conservar** no crea ninguna lista: en la misma
  sesión no se repite (la app manda `exclude`), pero puede volver en otra sesión. **Deshacer** revierte la última
  acción vigente (en el servidor) y devuelve la tarjeta arriba.
- **Autorización por recurso:** las acciones solo aceptan objetos del dataset del usuario (si no, 404).
- **App:**
  - una tarjeta grande con imagen (fallback de categoría si falla), categoría, NEW y motivo verificable;
  - enlace externo discreto;
  - gestos (deslizar a la izquierda para descartar, a la derecha para conservar) y tres botones accesibles con las
    mismas acciones;
  - un borde de «mazo» indica que hay más tarjetas sin mostrar la siguiente, que ni se ve ni se lee antes de tiempo;
  - el mazo se monta por usuario: al cambiar de sesión empieza de cero;
  - sin recomendaciones se explica por qué (sin almas gemelas o sin zona) y no se inventa nada;
  - no se muestra ningún porcentaje «Para ti» (no hay una puntuación calibrada).

## Fase 9 · 2026-10-14 (Categories y feed continuo)

> Requisito del usuario (2026-10-14): «las recomendaciones tendrían que tener un número que tienda al infinito; al estilo
> de Tinder».

- **Feed continuo sin inventar nada.** Cuando se agotan los bloques principales (70/20/10) siguen tres respaldos, en
  este orden y cada uno con su motivo. §12 permite usar otro bloque válido con `reasonCode` y fallback explícitos.
  - **Comunidad**: valorado muy bien por al menos 2 personas de APPINITY (cualquiera elegible del dataset, sin afinidad
    ni zona). Media bayesiana con los votos bajos; si sale ≤ 0, no se muestra. Motivo: «Lo valoraron muy bien N personas
    de APPINITY». Nunca se presenta como «tus almas gemelas».
  - **Conservados**: lo que el usuario conservó en otra sesión vuelve (§2). Solo en Inicio. Motivo: «Lo conservaste en
    otra sesión».
  - **Explorar**: obras y lugares del catálogo que **nadie** de APPINITY ha valorado todavía, en un orden estable por
    usuario y día. Motivo literal: «todavía no tenemos señales sobre esto». Lo valorado, aunque sea mal, no sale aquí.
  - Los filtros comunes (conocidos, descartes en Inicio, sesión, radio, eventos terminados) valen también para los
    respaldos.
  - Con un catálogo finito el mazo termina cuando se ha visto todo; con el catálogo real, que crece con las
    importaciones, se acerca al «infinito» pedido.
- **Paginación**: `POST /v1/me/recommendations/query` recibe la cola de la sesión en el cuerpo (hasta 5.000 ids),
  porque un mazo sin fin no cabe en una URL. El `GET` se mantiene.
- **Categories (§3)**:
  - recomendaciones de la categoría con el mismo motor;
  - no aplica los descartes de Inicio, pero sí los conocidos;
  - lugares dentro del radio; sin ubicación, sin lugares;
  - el consenso usa las almas gemelas por afinidad global, así que una categoría sin historial propio también recibe
    recomendaciones; no se muestra ninguna «afinidad de categoría» inventada;
  - selector «Recomendado / Catálogo» con el color de la categoría y paginación al llegar al final.

## Fase 10 · 2026-10-14 (People y Friends)

- **Amistad** (tabla `friendships`, migración 0008): una fila por pareja (índice único sobre la pareja ordenada), con
  estados `pending`, `accepted` y `rejected`.
  - Pedir amistad a quien ya te la pidió equivale a aceptarla.
  - **Un rechazo no se revela**: quien envió la solicitud la sigue viendo pendiente y no puede insistir. Quien rechazó
    sí puede pedir amistad después.
  - Una solicitud recibida se rechaza, no se borra.
  - Los amigos no tienen por qué ser almas gemelas: se muestra su afinidad, o «—».
- **Bloqueo**: excluye en ambas direcciones del ranking, del perfil, de la afinidad, de las solicitudes y de los votos y
  atribuciones del recomendador, y elimina la amistad o la solicitud. Solo se lista a quien yo bloqueé (nunca quién me
  bloqueó) y se puede desbloquear.
- **Reporte** (tabla `user_reports`): motivo cerrado (spam, acoso, contenido inapropiado, suplantación u otro) y nota
  opcional de hasta 500 caracteres. Opcionalmente bloquea a la vez. No se comunica a la persona reportada. Su revisión
  (moderación) queda fuera del MVP.
- **Privacidad**: `discoverable_as_soulmate` (por defecto, sí). Si se desactiva, la persona no aparece en el ranking ni
  en las atribuciones de otras personas. Sigue viendo el suyo, y su perfil sigue accesible a quien ya la conoce.
- **Afinidad mutua excepcional**: ambas direcciones ≥ 90. Con `affinity-v3` (simétrica), equivale a afinidad ≥ 90 con
  evidencia válida.
- **Contactos (pendiente, diseño)**: necesita una identidad verificada (teléfono o email), que no existe hasta la
  autenticación de producción (fase 13). Propuesta:
  - permiso explícito del sistema (`expo-contacts`) y del usuario en la app, solo bajo demanda;
  - normalización en el dispositivo (E.164 o email en minúsculas);
  - envío solo de un HMAC con clave del servidor y por lotes limitados;
  - el servidor responde solo con coincidencias de personas con `discoverable_by_contacts` activado y no guarda lo
    recibido;
  - límite de peticiones para impedir enumeración.

  Un hash, incluso con clave, **no garantiza el anonimato**: los teléfonos tienen poca entropía y quien tenga la clave
  puede recorrerlos todos. Por eso se minimiza lo enviado y lo guardado, y no se sube la agenda completa por defecto.

## Fase 12A · 2026-10-14 (Chat)

Se adelanta a la fase 11 por decisión del usuario: el chat es uno de los núcleos de la aplicación («poder charlar con la
gente con la que tienes afinidad, igual que en Tinder cuando haces match»).

- **Modelo «match», inspirado en Tinder** (solo su funcionamiento público; no se copia código, marca ni diseño):
  - «Quiero hablar» en el perfil equivale al *like*: no envía ningún mensaje.
  - Si la otra persona acepta, o si también había mostrado interés, hay **match**: pantalla «¡Es un match!» y se abre la
    conversación. Una amistad aceptada también abre el chat (migración: las amistades existentes reciben su conversación).
  - Nadie recibe mensajes de quien no ha aceptado. Así se cumple EARLY_ACCESS (§16: solicitud y aceptación).
- **Dónde vive el chat**: la app conserva sus cuatro pestañas (regla de producto). El chat está en **Personas →
  Chats** (segmento por defecto), con aviso numérico en la propia pestaña. La bandeja sigue el esquema de Tinder:
  - solicitudes recibidas;
  - fila de **nuevos matches** (aún sin mensajes, con anillo si no se han visto);
  - **conversaciones** ordenadas por el último mensaje, con no leídos.
  Desde el perfil de cualquier persona visible: «Quiero hablar», «Aceptar y chatear» o «Enviar mensaje».
- **Ignorar** no se revela (quien envió la solicitud la sigue viendo «enviada» y no puede insistir) ni genera señales.
  Quien ignoró puede cambiar de idea: si después muestra interés, el match es inmediato.
- **Deshacer el match**: la conversación desaparece para las dos personas. La otra no puede volver a pedirlo; quien lo
  deshizo sí puede mostrar interés de nuevo (y, como la otra ya lo había mostrado, el match vuelve, vacío).
- **Bloquear** cierra la conversación y borra las solicitudes de chat entre ambas. Desbloquear no la recupera; un match
  nuevo la reabre **vacía** (los mensajes antiguos se borran al reabrir). El reporte se hace desde el perfil.
- **PREMIUM_DIRECT_MESSAGE**: la ruta existe (primer mensaje como solicitud; responder equivale a aceptar; un único
  mensaje sin respuesta). **Sin RevenueCat nadie es Premium**: la API responde 403 aunque el flag esté activo. El
  entitlement solo se inyecta en tests de dominio, marcado como tal. No se finge ningún entitlement.
- **Permisos en servidor**: toda lectura y escritura comprueba que la persona es miembro de una conversación activa y que
  puede ver a la otra (mismo dataset, activa, sin bloqueos). Si no, 404 (no se revela si existe).
- **Anti-abuso**:
  - 30 solicitudes nuevas por persona y 24 h;
  - 20 mensajes por minuto y 500 al día;
  - de 1 a 1.000 caracteres;
  - el limitador HTTP por ruta añade una segunda barrera.
  Al superarlos, la API responde 429. El `clientId` evita duplicados al reintentar.
- **Sin push todavía** (fase 12C): la bandeja se consulta cada 15 s y la conversación abierta cada 4 s. Leído y «Visto»
  con `last_read_at` por miembro.
- **Ningún permiso nuevo**: el chat no pide permisos del sistema ni configuración adicional (regla del usuario: solo se
  acepta al registrarse). Las futuras notificaciones push sí requieren el permiso del sistema operativo. La propuesta es
  pedirlo dentro del alta (fase 12C/13), nunca después.
- **Gustos intactos**: ningún paso del chat lee ni escribe preferencias, perfiles de objetos ni afinidades (lo comprueba
  un test). La pantalla de match solo dice «os gustan cosas parecidas» con afinidad calculada ≥ 50. La sugerencia para
  romper el hielo usa la categoría de mayor afinidad, nunca objetos del historial ajeno.

## 2026-10-14 · Aceptación del chat y reglas sociales (usuario)

- Chat aceptado en el teléfono.
- **Almas gemelas**: se ven sus datos de afinidad y se puede elegir hablar con ellas. **Más adelante, hablar con almas
  gemelas será una opción Premium.**
- **Amigos**: siempre aparecen en el listado, con afinidad alta, baja o «—», con sus datos de afinidad, y siempre se puede
  hablar con ellos.

## Fase 11 · 2026-10-14 (análisis de fuentes)

- Análisis completo en [source-candidates.md](source-candidates.md).
- Spotify, Last.fm, Deezer, TMDB y Open Library quedan **bloqueadas** para uso comercial gratuito (condiciones oficiales
  comprobadas hoy).
- **Prioridad 1: ampliar Google Data Portability** (libros y juegos de Play, pedidos de comida, guardados) dentro del
  mismo consentimiento del alta.
- Prioridad 2: Apple Music (MusicKit).
- Prioridad 3: las APIs de portabilidad DMA (TikTok, Meta, Amazon, Apple App Store), gratuitas por ley pero con
  aprobación previa del desarrollador.
- Las exportaciones RGPD subidas como archivo quedan aparcadas: exigen pasos después del alta.

## Fase 11 · 2026-10-14 (Google ampliado: Play, pedidos y guardados)

- Apple Music queda **descartada** mientras exija pago (decisión del usuario).
- Se añaden `play.library`, `order_reserve.purchases_reservations` y `saved.collections` al **mismo consentimiento
  de Google** del alta: ningún permiso ni configuración posterior para usuarios nuevos.
- **Semántica**:
  - descargar o comprar en Play prueba que se conoce, no que se use ni que guste: conocido, preferencia NULL;
  - pedir o reservar prueba consumo; repetir sugiere gusto (preferencia por frecuencia desde 2 visitas, confianza 0,5
    porque es conducta, no un voto);
  - guardar no prueba gusto (§5), igual que los sitios con estrella.
- **Geocodificación**: Nominatim (OSM, ODbL) en vez de un proveedor de pago. Su política obliga a ≤ 1 consulta/s, caché
  y uso moderado, así que hay tope por sync y endpoint configurable; para producción a escala, instancia propia. La
  identificación final sigue siendo la regla OSM (nombre y tipo a ≤ 100 m), así que un geocodificado erróneo no
  identifica un lugar equivocado. En una prueba real, nombre y dirección juntos no dan resultado: se consulta primero la
  dirección y después nombre + ciudad.
- **Apps**: solo cuentan los videojuegos (P3418 en Wikidata, o el título limitado a juegos). WhatsApp, Gmail y similares
  quedan fuera de categoría y se informan como tales, no como «no identificados».
- **Minimización**: ni platos, ni importes, ni pagos, ni notas o comentarios de las colecciones.

## 2026-10-15 · Conexión de Google: incidencias reales y arreglos

- **`prompt=consent` retirado**: Google lo rechaza con 400 invalid_request para este cliente. Se aisló probando cada
  parámetro por separado: los 11 permisos, `access_type=offline` y PKCE funcionan; `prompt=consent` no.
- **Sin refresh token, se conecta igualmente**: con un consentimiento real mostrado y aceptado, Google no entregó
  refresh token. Se guarda el access token cifrado con su caducidad (≈ 1 h). Basta para iniciar los exports en el
  primer sync, que la API lanza al conectar. Cuando caduca, la conexión pide renovar el permiso. El worker registra qué
  tipo de acceso dio Google («con renovación automática» o «sin renovación hasta …») para seguir investigándolo sin
  pruebas aparte.
- **Vista web: página completa en vez de ventana emergente**: Google corta el vínculo con la ventana de origen
  (Cross-Origin-Opener-Policy), así que la emergente no podía cerrarse ni avisar a la app y se acumulaban ventanas. La
  API vuelve a `/profile?source=…&result=…&message=…` y la tarjeta de fuentes muestra el resultado.

## Fase 12B · 2026-10-15 (Premium con RevenueCat)

- **El servidor es la única fuente de verdad**: Premium solo se concede con webhooks de RevenueCat. La app nunca se
  declara Premium. El `app_user_id` de RevenueCat es el id de usuario de APPINITY (también se buscan sus alias).
- **Reglas de la documentación de RevenueCat** (consultada el 2026-10-15):
  - entrega «al menos una vez»: idempotencia por `event.id` (tabla `revenuecat_events`);
  - `EXPIRATION` retira el acceso; `CANCELLATION` y `SUBSCRIPTION_PAUSED`, no (sigue hasta la caducidad);
  - `TRANSFER` quita el acceso al origen y lo da al destino;
  - `TEST` se registra sin efecto;
  - un evento más antiguo que el último aplicado se ignora.
- **Autenticación del webhook**: cabecera `Authorization` configurada en el panel de RevenueCat
  (`REVENUECAT_WEBHOOK_AUTH`), comparada en tiempo constante. Sin configurar: 503. Incorrecta: 401.
- **Sandbox y producción**: el entitlement se guarda por entorno. Cada instalación solo cuenta el suyo
  (`PREMIUM_ENVIRONMENT`; por defecto, sandbox salvo con `NODE_ENV=production`).
- **Qué da Premium ahora**:
  - explorar hasta **200 almas gemelas**, en vez de 50;
  - escribir sin match si `CHAT_PREMIUM_DIRECT_MESSAGE` está activo.
  El consenso del recomendador sigue usando **siempre el Top 50** (`CONSENSUS_SOULMATES`, explícito en el código).
- **Regla de producto «más adelante»**: `CHAT_SOULMATES_PREMIUM` (desactivado). Activado, pedir chat a un alma gemela
  que no es amiga exige Premium; con los amigos se puede hablar siempre.
- **Compra en la app: pendiente**. El SDK de RevenueCat necesita una build de desarrollo (Expo Go no admite compras)
  y productos configurados en App Store Connect y Google Play. No se instala ni se simula: el Perfil lo explica.

## Fase 12C · 2026-10-15 (notificaciones push, servidor)

- **Expo Go en Android no admite push** desde el SDK 53 (documentación de `expo-notifications`, consultada el
  2026-10-15). Hacen falta una build de desarrollo y credenciales FCM V1. Por eso la parte de la app que pide el permiso
  y registra el token llega con esa build. Además, instalar `expo-notifications` con Metro y la vista web abiertos
  falló en Windows (ENOENT de pnpm al importar el paquete), y se restauró el lockfile.
- **Calendario**:
  - un resumen como mucho al día, a las 19:00 de la zona horaria de la persona, con ventana hasta las 22:00;
  - `three_per_week` (por defecto): lunes, miércoles y viernes; `daily`; `weekly`: domingo; `off`.
- **Deduplicación**: la fila de envío (único por persona, tipo y fecha local) se reserva antes de enviar.
- **Contenido de evidencia vigente**: recomendaciones aún no vistas (las marcadas NEW) y conversaciones o solicitudes
  pendientes. Sin nada nuevo no se envía; se registra «empty».
- **Expo push**:
  - lotes de 100 y reintentos ante 429 o 5xx;
  - `EXPO_ACCESS_TOKEN` opcional (seguridad reforzada de EAS);
  - `DeviceNotRegistered` desactiva el token.
  Los recibos (comprobar a los ~15 min que FCM o APNs aceptó) quedan pendientes.
- **Permiso**: según la regla del usuario, se pedirá una sola vez durante el alta (build de desarrollo), nunca después.

## Fase 13 · 2026-10-15 (preparación de la beta)

- **Autenticación de producción: «Continuar con Google» (OpenID Connect)**.
  - Gratuita; usa el mismo cliente OAuth que Data Portability, en una autorización aparte (Google no mezcla esos
    scopes con `openid`).
  - La API hace todo el flujo: PKCE, `nonce` y verificación del ID token con las claves públicas de Google. La app
    recibe un **código de un solo uso** (2 min) y lo canjea; los tokens nunca van en una URL.
  - Solo se guarda el email si Google lo da verificado.
  - Sin `prompt=consent`, porque Google lo rechaza para este cliente.
- **Sesiones**:
  - access token de 15 min (HS256 con `AUTH_SECRET`, distinto del de desarrollo);
  - refresh token opaco de 90 días, guardado solo como hash y **rotado en cada uso**;
  - cerrar sesión y eliminar la cuenta surten efecto al momento (el guard comprueba la sesión en cada petición).
- **Alta = único momento de consentimiento**: mayoría de edad y condiciones, y a continuación las fuentes. Una cuenta
  sin alta no aparece para nadie.
- **Eliminar la cuenta**: revoca los permisos en cada proveedor y borra al usuario en cascada. Las copias de seguridad
  (14 días) caducan después.
- **Producción blindada**: la API no arranca con `DEMO_MODE`/`DEV_AUTH_ENABLED` ni sin `AUTH_SECRET`. Imagen sin root ni
  secretos. API solo en 127.0.0.1, detrás de un proxy HTTPS.
- **Reutilización del refresh token** (migración 0013): se guarda el hash del token anterior. Si alguien lo presenta
  después de rotarlo, lo tienen dos partes y se revoca la sesión entera (OAuth 2.0 Security BCP).
- **Recibos de Expo push**: ~15 min después del envío se consulta si FCM o APNs aceptaron cada notificación.
  DeviceNotRegistered desactiva el token. Sin recibo todavía, se vuelve a mirar, como mucho hasta las 23 h.
- **Pendiente con justificación**: «Iniciar sesión con Apple» (iOS; requiere Apple Developer Program, de pago).

## 2026-10-15 · Por qué Google no entregaba el refresh token (Data Portability)

- Documentación oficial: el refresh token se entrega **solo en la primera autorización** con `access_type=offline`
  (el ejemplo de «Use Time-Based Access» no usa `prompt`). En autorizaciones posteriores no se repite salvo con
  `prompt=consent` (que Google rechaza ahora para este cliente) o si el usuario **quita la conexión** de la app.
- Las conexiones de Data Portability están en **myaccount.google.com/connections** (no en `/permissions`).
  `authorization:reset` y la revocación por API no hicieron que Google volviera a tratarlo como primera autorización.
- Solución: el usuario quita APPINITY en esa página una vez y vuelve a conectar. La app lo explica cuando el acceso
  temporal caduca. Con el cliente en producción, la renovación la hace el usuario desde esa misma página.
- **Comprobado (2026-10-15)**: tras quitar la conexión en myaccount.google.com/connections y reconectar, la conexión guarda refresh token; el refresh devuelve un access token con los 11 permisos (acceso temporal) y se conservan las fechas de export. En modo Testing dura 7 días.

## 2026-10-15 · Twitch descartada

El acuerdo de desarrolladores de Twitch exige permiso escrito para guardar sus datos más de 24 h y para usar o compartir insights derivados. APPINITY guarda evidencia permanente y la usa para recomendar a otras personas, así que no se implementa sin ese permiso. Ver [source-candidates.md](source-candidates.md).

## 2026-10-15 · Google Books

- En el **alta**, el permiso de Books va en el mismo consentimiento de «Continuar con Google» (regla del único momento de consentimiento). Si se concede, la conexión se crea sola y empieza su primer sync.
- Para cuentas creadas antes, hay una conexión normal (otra URL de vuelta autorizada).
- Favoritos es un me gusta explícito. Comprar o querer leer no prueba gusto: solo cuenta como conocido.

## 2026-10-15 · Trakt

- PKCE sin secreto de cliente, como recomienda Trakt. Su refresh token rota en cada renovación, así que el sync guarda el
  nuevo antes de leer nada.
- Identificación exacta por IMDb o TMDB en Wikidata. Si no hay ID, título exacto limitado a la categoría.
- Valoración 1–10 explícita; favorito = me gusta; visto = consumido sin preferencia; pendiente = solo conocido.

## 2026-10-16 · AniList y User-Agent de Trakt

- AniList usa «authorization code» con el secreto en el servidor. El token dura 1 año y no tiene renovación: al caducar se pide volver a conectar.
- En AniList, «abandonado» cuenta como consumido con preferencia NULL. No se trata como rechazo, porque AniList no dice el motivo.
- Anime película va a cine y el resto del anime a series. Manga y novela ligera van a libros: no se crea una novena categoría.
- Las fuentes detrás de Cloudflare no reciben el User-Agent del catálogo, que contiene «Claude» y se bloquea como bot.

## 2026-10-22 · Google Calendar

- **Sin conexión aparte**: el calendario solo se concede en «Continuar con Google» (un único momento de permisos). Una cuenta ya creada lo obtiene al volver a entrar.
- **Semántica §6**: un evento es intención, no asistencia. Conocido 0,8, consumido 0 y preferencia NULL, también para los eventos pasados.
- **Títulos**: solo con un prefijo o sufijo explícito («Concierto: X», «Cine: X»). Un título libre no se interpreta, para no inventar gustos.
- **Ubicaciones**: no se envían a geocodificar las direcciones sin nombre, los lugares privados ni las ubicaciones en línea.
- **Revocación**: un permiso compartido con el inicio de sesión no se revoca al desconectar una fuente (`sharedGrant`).

## 2026-10-22 · Scopes restringidos de Google

- `myactivity.youtube` y `maps.starred_places` son restringidos: en producción exigen una evaluación CASA anual de pago.
- Sin pagos, `GOOGLE_RESTRICTED_SCOPES` es false por defecto en producción y solo se piden los scopes sensibles, cuya verificación es gratuita. En desarrollo se piden todos.
- Detalle en docs/google-verification.md.

## 2026-10-22 · Arranque en frío

- **Relaciones de contenido**: son datos públicos de Wikidata (CC0) y no se guarda qué usuario las originó. Pesos
  propuestos sin calibrar:

  | Relación | Peso |
  |---|---|
  | Saga o secuela | 1 |
  | Director, creador o autor | 0,8 |
  | Influencia | 0,7 |
  | Guionista o estudio | 0,6 |
  | Géneros | 0,4–0,6 |

- **Diversidad**: como mucho 3 recomendaciones por gusto de origen. Dos relaciones desde el mismo gusto no suman dos
  veces.
- **Imágenes**: solo licencias libres de Commons, con autoría guardada. Para los restaurantes no se busca «una foto
  cerca», que podría ser de otro sitio.
- **Invitaciones**: compartir el enlace es el consentimiento de quien invita y aceptarlo, el de quien recibe; por eso se
  crea la amistad directamente. Todas las rutas requieren sesión.
- **Ciudad en el alta**: opcional y aproximada. Se geocodifica antes de completar el alta para no dejarla a medias.
- **Build de desarrollo**: local con Gradle, sin EAS (sin coste). La carpeta `android/` se genera con prebuild y no se
  versiona.

## 2026-10-23 · affinity-v4 (encogimiento parcial por categoría)

- **Problema detectado por el titular**: Clara tenía un 86 % global y ninguna categoría pasaba de 50. Cada categoría se
  penalizaba solo con su propia evidencia, mientras la global sumaba la de todas. Era coherente con la fórmula, pero
  contradictorio a la vista.
- **Solución**: dentro de la global, cada categoría se encoge hacia la calidad global de la pareja (Q) según su
  evidencia, en vez de hacia 0: `categoría = 100 · E · (w · calidad_c + (1 − w) · Q)` con `w = 1 − exp(−n_eff/tau)`.
- **Propiedades**:
  - la global queda siempre entre la menor y la mayor categoría;
  - con mucha evidencia, el desacuerdo real llega a ~0;
  - con una sola categoría comparable, el resultado coincide con v3;
  - sigue sin haber cifras altas con poca evidencia, porque E las limita a todas.
- **Resultado** (Laura ↔ Clara, demo): la global se mantiene en 86 y las categorías pasan de 31–49 a 85–87.

## 2026-10-26 · Recomendaciones por persona y barra inferior (decisiones del titular en la prueba D5)

- **Sin lista de «recomendaciones de una persona»** (p. ej., «solo de Clara» o «restaurantes de Clara»). Se mantiene la
  regla de la especificación: el perfil no revela historiales y una recomendación atribuida solo revela el objeto y su
  motivo, de una en una en Inicio. Alternativas descartadas por ahora: con permiso explícito de la persona, o un filtro
  «a través de X» en Inicio.
- **La barra inferior sigue oculta en las pantallas de detalle** (perfil de persona, obra, categoría y chat), según el
  patrón de Material Design: se vuelve con la flecha atrás.

## 2026-10-26 · Amigos desde los contactos (cierra la fase 10)

- **Solo emails, y solo los verificados**: el servidor compara con el email que Google da como verificado en el inicio
  de sesión. No hay teléfonos verificados, así que no se buscan teléfonos.
- **SHA-256 en el móvil, no HMAC**: la propuesta anterior (HMAC «con clave del servidor» calculado en el dispositivo)
  exigía meter la clave en la app, y entonces deja de ser secreta. El móvil envía el SHA-256 de cada email normalizado
  (minúsculas, sin espacios); el servidor lo compara con `sha256(lower(email))` en la consulta y **no guarda** lo
  recibido. Un hash no anonimiza a quien ya conoce el email: por eso solo responde con personas que tienen activado
  «Permitir que mis contactos me encuentren», respeta los bloqueos y el dataset, y limita la ruta a 5 peticiones por
  minuto y 500 emails por petición.
- **Bajo demanda**: el permiso de contactos del sistema solo se pide al pulsar «Buscar en mis contactos». Los
  resultados viven en memoria; de ahí se puede enviar una solicitud de amistad.

## 2026-10-26 · Imágenes más representativas (sin licencias nuevas)

- **Por categoría** (`IMAGE_CLAIMS`): en películas y series, cartel libre (P3383) y, si no hay, logotipo del título
  (P154); nunca la imagen genérica (P18), que en cine suele ser una foto del reparto, de un estreno o de un rodaje. En
  podcasts, logotipo antes que foto. Un SVG siempre es logotipo. Cada imagen guarda su tipo (`catalog_images.kind`).
- **Revisión**: al arrancar, el worker reevalúa las imágenes de Commons ya guardadas con estas reglas (cambia,
  reclasifica o quita). Solo toca objetos por los que Wikidata ha respondido.
- **En la app**: un logotipo se muestra entero sobre un cartel del color de la categoría; sin imagen, un cartel de
  diseño (fondo oscuro teñido y el icono grande) en lugar del recuadro pálido.
- **Plex y Stremio** no usan fuentes libres: Plex toma pósteres sobre todo de TMDb y TheTVDB (y fanart.tv como agente
  adicional); Stremio (Cinemeta) usa IDs de IMDb y sirve el arte desde MetaHub, derivado de esas mismas fuentes.
  Los pósteres reales exigen un acuerdo comercial con TMDb o TheTVDB: sigue siendo la decisión de negocio pendiente
  (2026-10-09).

## 2026-10-26 · Rediseño visual: dirección «Aura» (/creative)

- **Motivo (titular)**: la app parece genérica, no transmite «personas», las imágenes son pobres y le falta pulido.
  Alcance elegido: **rehacer** la identidad. Tono: vibrante, social y juguetón. Referencias: Spotify Wrapped y
  Hinge/Tinder.
- **Elegida la B, «Aura»** (vibrante, cómplice, sobremesa), frente a «Bento» (segura) y «Fanzine» (neubrutalista).
  Cada pantalla toma la luz de lo que muestra (halo degradado con grano), la afinidad es el gran momento y las personas
  van delante de las obras.
- **Se conserva**: datos reales, de ejemplo y pendientes distinguidos; «—» sin datos; contraste AA; icono y nombre en
  cada categoría; botón alternativo para cada gesto; los 8 colores de categoría y los iconos propios.
- **Se retira**: el violeta `#8E78F0` como único acento (aspecto genérico de «app de IA»), Space Grotesk (grotesca
  de startup sin calidez), las superficies planas sin profundidad y el cartel de sustitución gris.
- **Propuesta (sin aplicar aún en la app)**: acento «chispa» `#FF5E4D` solo para la acción principal; «lima»
  `#D4F45A` solo para afinidad y almas gemelas; Bricolage Grotesque (Google Fonts, OFL) para titulares y cifras;
  portadas generadas con color, icono y tipografía, rotuladas como tales (nunca imágenes inventadas por IA);
  movimiento elástico que se apaga con «reducir movimiento». Maqueta: `docs/design/aura/mockup.html`.
- **Aplicado en tokens e Inicio (2026-10-26)**: `theme.ts` con los valores de la maqueta y el token `affinity`;
  Bricolage Grotesque sustituye a Space Grotesk. El halo se hace con capas de vistas y una textura de grano, sin
  módulos nativos (mismo criterio que el velo de la tarjeta). La guía `docs/design/design-system/` queda desactualizada
  hasta su revisión.

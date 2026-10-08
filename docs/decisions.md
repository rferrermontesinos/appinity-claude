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
- **Lo ambiguo no se importa.** Se informa con un error parcial no bloqueante, como «12 de 40 … no se pudieron
  identificar con seguridad». Nunca se fusiona por un título parecido (§6).
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

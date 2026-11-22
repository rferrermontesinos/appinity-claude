# Progreso · APPINITY Claude

Leyenda: **Implementado** (código en el repositorio) · **Comprobado automáticamente** (tests o comandos
ejecutados aquí) · **Aceptado en dispositivo** (lo confirma el usuario en su teléfono).

| Fase | Estado | Evidencia / siguiente paso |
|---|---|---|
| 0 | **Aceptado en dispositivo** (2026-10-08) | Entrega 2026-10-08 · fase 0 (rama `fase-0`, PR rferrermontesinos/appinity-claude#1) |
| 1 | **Aceptado en dispositivo** (2026-10-08) | Entrega 2026-10-08 · fase 1 (rama `fase-1`, PR rferrermontesinos/appinity-claude#2, basada en `fase-0`) |
| Aceptación de demo | **Hecha** | El usuario confirmó: «He probado la demo y funciona» |
| 2 | **Validado con la cuenta real del usuario** (2026-10-08) | Entrega 2026-10-08 · fase 2 (rama `fase-2`, PR rferrermontesinos/appinity-claude#3, basada en `fase-1`) |
| 3–4 | Pendiente | TMDb y Last.fm, en ese orden |
| 5–7 | Pendiente | Afinidad, Top 50 y recomendador |
| 8–10 | Pendiente | Home, Categories y social |
| 11 | Pendiente | Fuentes adicionales viables, una por tarea |
| 12 | Pendiente | Chat, Premium y notificaciones, por subentregas |
| 13 | Pendiente | Preparación y prueba de beta |

---

## Entrega 2026-10-08 · fase 2 (Steam)

Rama `fase-2` (basada en `fase-1`), commit `867cd6c`, PR rferrermontesinos/appinity-claude#3.

### Qué se ha hecho

- **Validación en documentación oficial** de la autenticación y el acceso de Steam (ficha completa en
  [integration-capabilities.md](integration-capabilities.md#steam--fase-2)).
- **Adapter `profile/steam`** con la estructura común: OpenID 2.0 (construcción de URL y verificación completa con
  `check_authentication`), cliente de la Web API con reintentos y límites, sync de instantánea, mapper `steam-v1`,
  esquemas Zod de las respuestas, constantes y fixtures simulados.
- **Conexión con redirección**: `POST /v1/me/connections` devuelve la URL de Steam con un `state` de un solo uso;
  `GET /v1/connect/steam/callback` verifica y crea la conexión, encola el sync y vuelve a la app (lista blanca de URL).
- **Guardado y consolidación** con el pipeline común (resolución canónica por `steam:app`, observaciones idempotentes,
  perfiles), **desconexión** que olvida el SteamID y, opcionalmente, borra lo importado.
- **Errores**: perfiles o bibliotecas no visibles (mensaje accionable, conexión en «error», sin borrar evidencia), clave
  no válida (sin reintentos), 429/5xx/red (reintentos con backoff y `Retry-After`), entradas corruptas (errores
  parciales).
- **Syncs programados** cada hora para fuentes reales (24 h por conexión, configurable).
- **Cuenta local real** (`pnpm user:local`, migración `0003`) para usar datos propios con identidad de desarrollo, y
  aviso «DATOS REALES» en la app.
- **Credenciales sin chat**: `pnpm secret:set STEAM_WEB_API_KEY` (entrada oculta, solo a `.env`).
- **App**: login de cuenta local, botón oficial «Sign in through Steam», navegador de autenticación con vuelta a la
  app, estados «sin configurar», «solo cuentas reales» y «requiere tu acción», pista del SteamID.

### Comandos ejecutados y resultados (Windows 11, 2026-10-08)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm db:migrate` | Migración `0003_local_accounts_external_unique` aplicada |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK |
| `pnpm test` | **12 ficheros, 136 tests OK** (70 unitarios, 66 de integración). Nuevos: 17 unitarios de Steam (OpenID válido y manipulado, cliente con 429/5xx/403, biblioteca oculta frente a vacía, mapper, registro), 15 de integración del pipeline de Steam y 8 HTTP (cuenta local, inicio de conexión, callback, `state` de un solo uso, lista blanca de URL) |
| `pnpm db:seed` | La demo sigue igual e idempotente |
| `npx expo export --platform android --platform ios` | Bundles generados |
| `pnpm user:local --handle test_local_smoke …` | Crea la cuenta y guarda solo el hash (cuenta de prueba borrada después) |
| URL de OpenID contra Steam real | Steam acepta la petición y muestra su formulario «Iniciar sesión» con `return_to` en `192.168.1.16:3100` |

### Fallos detectados tras la entrega

- `pnpm secret:set` rechazaba una clave válida al pegarla en PowerShell: en modo «raw» el pegado puede llegar con
  caracteres de control o marcadores de pegado. Corregido: se limpian, se muestra un `*` por carácter, el error indica
  la longitud recibida (sin revelar el valor) y existe `--clipboard`. La clave nunca se guardó.

### Validación con la cuenta real (2026-10-08)

El usuario creó su clave, la guardó con `pnpm secret:set`, creó su cuenta local y conectó Steam desde el teléfono
(«Sign in through Steam»). Comprobado en la base de datos (solo totales):

| Comprobación | Resultado |
|---|---|
| Conexión | `active`, SteamID guardado, sin errores |
| Primer sync (al conectar, automático) | `succeeded`: 11 juegos recibidos, 11 evidencias nuevas, 11 objetos creados (dataset `live`), 0 errores parciales |
| Segundo sync (encolado como el botón «Sincronizar») | `succeeded`: **0 nuevas, 0 actualizadas, 11 sin cambios**, 0 borradas: sin duplicados |
| Claves idempotentes | 11 evidencias = 11 claves distintas |
| Modelo | 9 juegos con preferencia inferida (0,23–1,00, media 0,58); 2 jugados menos de 2 h, consumidos y sin preferencia; todas con fecha de última partida |
| Juegos con 0 h | La biblioteca real no tiene ninguno: la regla queda probada con fixtures, no con datos reales |
| Imágenes | 11 referencias al CDN de Steam (ninguno coincide con la instantánea de Wikidata); no se cachean |

### Observación de producto del usuario

«La sincronización debería hacerse automáticamente y sin tantos pasos, solo dando permisos al inicio, en el registro.
Se puede cambiar más adelante.» Registrado en [decisions.md](decisions.md#onboarding-y-sincronización-automática-observación-del-usuario).

### Pasos que hizo el usuario (solo desarrollo)

1. Crear la clave en <https://steamcommunity.com/dev/apikey> y guardarla con `pnpm secret:set STEAM_WEB_API_KEY`.
2. `pnpm user:local --handle … --name …` y entrar en la app con el código.
3. **Reiniciar `pnpm api` y `pnpm worker`**. Los que estaban en marcha desde la prueba de la demo tienen el código
   anterior cargado.
4. Perfil → Steam → «Sign in through Steam», comprobar la importación, repetir el sync (sin duplicados), juegos con
   0 h y desconectar.

Hechos el 2026-10-08. La desconexión con borrado está probada en integración con usuarios simulados; no se ejecutó
sobre la cuenta real para conservar sus datos.

### Limitaciones

- Sin fechas de lanzamiento de Steam (la Web API no las da); necesarias para Trending (fase 7).
- El arte de Steam es solo referencia; si el CDN no tiene cápsula 600×900, la app muestra el fallback.
- La cuenta local real sigue siendo identidad de desarrollo. La autenticación de producción llega en la fase 13.
- Calibración de horas → preferencia sin validar con datos reales.

### Siguiente paso

Fase 3 (TMDb) con `prompts/fase_03_tmdb.md`.

---

## Entrega 2026-10-08 · fase 1

Rama `fase-1` (basada en `fase-0`), commit `97bf4e5`, PR rferrermontesinos/appinity-claude#2.

### Qué se ha hecho

- **Catálogo canónico** (`catalog_items`, `catalog_external_ids` con espacio de nombres y unicidad por dataset,
  `catalog_images` con licencia y autor) e instantánea real de Wikidata/Commons: 108 objetos (96 principales de las
  ocho categorías, 4 ediciones, 8 temporadas) y 82 imágenes libres. Caché de imágenes en almacenamiento propio,
  fallback SVG por categoría y fechas con su precisión real.
- **Contrato de observaciones** con validación runtime (Zod) y constraints SQL equivalentes. Known, Consumed y
  Preference independientes; NULL coherente.
- **Resolución de entidades**: ID canónico → ID de proveedor → proveedor de catálogo → atributos exactos → creación.
  Edición (ISBN) → obra. Nunca por título parecido. Bloqueos para evitar duplicados concurrentes.
- **Consolidación v1** versionada (`consolidation-v1`) en `packages/algorithms`, sin dependencias de proveedores.
- **Conexiones**: consentimiento por proveedor, ejecuciones de sync con contadores, cursores y errores parciales,
  credenciales cifradas (AES-256-GCM, probado; sin uso todavía), desconexión con borrado opcional y recálculo.
- **Pipeline de ingesta** (`runConnectionSync`) con paginación, idempotencia, instantáneas, bloqueo por conexión y
  protección frente a escrituras tras la revocación. Worker BullMQ con colas `profile-sync` y `catalog-images`.
- **Adapter fixture** con la estructura común de §8 y cinco fuentes simuladas (cine/series, diario, actividad y lugares,
  juegos, música y podcasts) con fixtures deterministas para 5 usuarios (Sam sin datos).
- **API**: `/v1/sources`, `/v1/me/connections` (+sync, runs, delete), `/v1/catalog/items`, `/v1/me/item-profiles`,
  `/media/catalog/*`, `/static/fallback/*`.
- **App**: gestión de fuentes en Perfil, catálogo por categoría con imágenes y fallback, «Modelo de datos (demo)» con
  las tres dimensiones y etiquetas de casos, detalle con atribución de imagen, IDs externos y evidencias propias.
- **Seed de demo completo** e idempotente (`pnpm db:seed`).

### Casos del modelo cubiertos por los fixtures (y dónde verlos)

| Caso | Usuario y objeto |
|---|---|
| Conocido sin consumo (watchlist, «quiero», guardado) | Laura: Dr. Strangelove, Don Quijote, Cal Boter, El juego del calamar |
| Consumo sin valoración | Laura: Some Like It Hot, The Office, La Regenta, Big Buck Bunny |
| Valoración positiva y negativa | Laura: Casablanca +0,78, Frankenstein −0,33, La noche de los muertos vivientes −0,56 |
| Juego con cero horas | Laura y Àlex: Mindustry; Àlex: Stardew Valley |
| Mismo objeto en tres fuentes | Laura: Casablanca (cine, diario y actividad), una entidad y un perfil |
| Valoración negativa frente a asistencia | Laura: MACBA; Marta: MNAC |
| Fechas ausentes y solo con año | Laura: Dr. Strangelove (sin fecha), La Regenta y Big Buck Bunny (año) |
| Edición → obra | Laura: Orgullo y prejuicio (ISBN de una edición en español) |
| Objeto sin imagen libre (fallback) | Robot Dreams, Stardew Valley, Baldur's Gate 3, Crims, Radiolab… |
| Objeto desconocido para el catálogo | Àlex: Portal (appid 400) |
| Escucha aislada sin preferencia | Laura: Joan Manuel Serrat (1 escucha) |
| Episodios agregados por programa | Núria: Serial (5 episodios), Crims (6) |
| Evento previsto sin asistencia | Laura: Palau de la Música; Marta: 31 Manga Barcelona |
| Registro inválido (validación runtime) | Laura: `scr-l-10` (valoración 11) |
| Usuario sin evidencia | Sam |

### Comandos ejecutados y resultados (Windows 11, 2026-10-08)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm db:reset` y `pnpm db:seed` (repetido) | 6 usuarios, 108 objetos, 14 syncs. Segunda ejecución: 0 nuevos y 0 actualizados en todo; 109 objetos (108 + Portal), 82 observaciones, 74 perfiles, 14 conexiones |
| `pnpm worker` (caché de imágenes) | 82/82 imágenes cacheadas (24 MB en `.data/media`) |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK |
| `pnpm test` | **9 ficheros, 96 tests OK**: 53 unitarios (normalización, consolidación, mappers fixture, sync, registro, cifrado, i18n, categorías) y 43 de integración (pipeline completo, API de catálogo, conexiones y perfiles, auth) |
| `npx expo install --check` | «Dependencies are up to date» |
| `npx expo export --platform android --platform ios` | Bundles Hermes generados (Android 5,3 MB, iOS 5,1 MB) |
| API por la IP de red (`curl` desde el PC) | Fuentes, conexiones, catálogo, perfiles, imágenes 200, fallback 200, path traversal 404, recursos ajenos 404 |
| Flujo completo por la IP de red | Marta: desconectar y borrar (13 → 1 perfil), reconectar (sync del worker +13), resync completo (=13, sin duplicados) |
| Vista web de desarrollo (navegador integrado, 375×812) | dev-login, Modelo (28 objetos de Laura), detalle de Casablanca, catálogo de juegos (11 imágenes 200 + 4 fallbacks), Perfil/fuentes, estado vacío de Sam en inglés |

### Fallos detectados y corregidos durante la verificación

- La segunda ejecución del seed marcaba 2 observaciones como actualizadas: la huella incluía el método de resolución.
- Conectar dos veces una fuente devolvía 500 en lugar de 409 (Drizzle envuelve el error de PostgreSQL).
- La app cerraba sesión al arrancar: una consulta sin token recibía 401 y borraba la sesión guardada (afectaba también
  al móvil).
- Precisión de fecha inventada en ediciones y temporadas de la instantánea («día» cuando solo había año).
- Errores parciales mostrados como JSON en bruto; ahora son legibles.

### Validación manual pendiente (usuario, en el teléfono)

Recorrido de 16 pasos de la sección «Probar en el teléfono» del README. En particular: carga en Expo Go del SDK 57,
API alcanzable desde el móvil, imágenes reales y fallback, las tres dimensiones en «Modelo de datos (demo)», sync
repetido sin duplicados, desconectar y borrar, cambio de idioma y de ajustes.

**No se ha probado en ningún dispositivo ni emulador**: el emulador del PC tiene Expo Go 55 y no se actualizó para no
alterar la otra implementación.

### Limitaciones de esta entrega

- Todas las fuentes son simuladas; ninguna integración real está validada.
- Sin recomendador, afinidad, almas gemelas, Trending ni carrusel (fases 5–8); Categories muestra catálogo, no
  recomendaciones.
- Los parámetros de normalización, consolidación y resolución son propuestas sin calibrar.
- Las imágenes cacheadas no se redimensionan (algunas superan 1 MB).
- No hay pruebas automatizadas de interfaz en dispositivo.
- Identidad de desarrollo; sin autenticación de producción.

### Siguiente paso

Aceptación manual de la demo por el usuario. Después, fase 2 (Steam) con `prompts/fase_02_steam.md`.

---

## Entrega 2026-10-08 · fase 0

Rama `fase-0`, PR rferrermontesinos/appinity-claude#1.

### Qué se ha hecho

- Monorepo pnpm (Node 24, pnpm 11, TypeScript 6) con `apps/api`, `apps/mobile`, `packages/{shared,i18n,
  algorithms,database,catalog,integrations,ingestion}` y `workers/sync-worker`.
- Docker Compose aislado (`appinity-claude`): PostgreSQL 17 + PostGIS 3.5 en 5442 y Redis 7.4 en 6390.
- Migraciones Drizzle `0000_enable_postgis` y `0001_identity` (`users`, `user_profiles`, `user_settings`).
- Seed determinista de 6 usuarios **simulados** (`dataset = demo`).
- API NestJS: `/health`, identidad de desarrollo (`/v1/dev/users`, `/v1/dev/session`), `/v1/me`,
  `PATCH /v1/me/settings`, guard global de sesión, rate limiting, validación Zod y configuración validada al
  arrancar.
- Worker BullMQ con latido en Redis, visible en `/health`.
- App Expo SDK 57: elección de usuario de demo, cuatro pestañas (Inicio, Categorías, Personas, Perfil), ajustes
  conectados a la API, diagnóstico de red e i18n es/en.
- Scripts `pnpm setup` (secretos e IP de red) y `pnpm doctor` (diagnóstico).

### Comandos ejecutados y resultados (Windows 11, 2026-10-08)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK («Already up to date», 11 proyectos del workspace) |
| `pnpm setup` | `.env` creado; `EXPO_PUBLIC_API_URL=http://192.168.1.16:3100` |
| `pnpm services:up` | Postgres y Redis `healthy` |
| `pnpm db:migrate` (dos veces) | OK las dos veces (idempotente) |
| `pnpm db:seed` (dos veces) | 6 usuarios; sin duplicados (`select count(*) from users` = 6) |
| `pnpm db:reset` | Vacía, migra y siembra correctamente |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK (paquetes, tests y app móvil) |
| `pnpm test` | 3 ficheros, **19 tests OK** (unit: i18n y categorías; integración: health, 401 sin sesión, token falso, otro secreto, caducado, `kind` incorrecto, token con `sub` de usuario real, usuario suspendido, aislamiento por usuario, validación de ajustes, redondeo de ubicación, prohibición de `DEMO_MODE` en producción, identidad desactivada) |
| `pnpm api` + `pnpm worker` | `/health` 200 con database, postgis (3.5.2), redis y worker OK |
| `curl http://192.168.1.16:3100/health` (desde el PC) | 200 `status: ok` |
| `npx expo export --platform android --platform ios` | Bundles Hermes generados (Android 5,2 MB; iOS 5 MB) |
| `npx expo install --check` | «Dependencies are up to date» (SDK 57) |
| `npx expo start --port 8091` | Manifiesto servido en `http://192.168.1.16:8091` con `runtimeVersion exposdk:57.0.0` |
| `pnpm doctor` | Servicios healthy; API accesible en 127.0.0.1 y en 192.168.1.16 |

### Validación manual pendiente (usuario, en el teléfono)

- Abrir `http://<IP-del-PC>:3100/health` en el navegador del móvil.
- Cargar la app con Expo Go, elegir usuario, recorrer las cuatro pestañas, cambiar idioma, radio y zona.
- El acceso a la API desde el móvil **no se ha comprobado aquí**: solo desde el propio PC por la IP de red.

### Limitaciones de esta entrega

- La identidad es de desarrollo; no hay autenticación de producción.
- Sin catálogo, observaciones, conexiones ni consolidación (fase 1).
- Los tests de interfaz móvil no se han automatizado; la prueba en el dispositivo es manual.
- Durante la verificación se detuvo por error el servidor Metro (puerto 8081) de otra implementación local; no
  se tocaron sus archivos ni datos. Desde entonces solo se detienen procesos cuya ruta contiene `APPINITY CLAUDE`.

### Siguiente paso

Fase 1: catálogo con imágenes y fallback, IDs canónicos, observaciones normalizadas, conexiones, consolidación,
adapter fixture y vista de demo del modelo.

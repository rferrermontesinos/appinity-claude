# APPINITY · implementación Claude

> Descubre recomendaciones de tus almas gemelas y conoce a las personas que comparten tus gustos.

Implementación independiente de APPINITY construida desde cero a partir de
[docs/APPINITY_Especificacion.md](docs/APPINITY_Especificacion.md). No reutiliza código de otras implementaciones.

**Estado:** fases 0 y 1 aceptadas en el teléfono. Fase 2 (Steam) **validada con una cuenta real**. Fase 3 (TMDb)
**implementada y probada con respuestas simuladas; pendiente de validar con tu cuenta**
([docs/progress.md](docs/progress.md)). Todavía **no** hay recomendador, afinidades ni almas gemelas.

## Qué es real y qué es simulado

| Elemento | Naturaleza |
|---|---|
| Objetos del catálogo (108: 96 principales de las ocho categorías, 4 ediciones de libros y 8 temporadas; restaurantes y cultura de Barcelona, Girona y Figueres) | **Reales**: instantánea congelada de Wikidata (CC0) |
| Imágenes (82 objetos con imagen libre) | **Reales**: Wikimedia Commons, con autor y licencia. Los 14 objetos principales sin imagen libre usan la imagen de sustitución de su categoría; ediciones y temporadas reutilizan la de su obra o serie |
| Usuarios de la demo (6, con «(demo)» en el nombre) | **Simulados** (`dataset = demo`) |
| Actividad de esos usuarios (valoraciones, horas, escuchas, visitas…) | **Simulada**: archivos de fixtures del repositorio |
| Fuentes «Demo · …» | **Simuladas**: mismo contrato de adapter que las fuentes reales, sin OAuth ni proveedores |
| Steam | **Real** (fase 2): OpenID + Steam Web API. Solo para cuentas reales; requiere `STEAM_WEB_API_KEY` en el servidor |
| TMDb | **Real** (fase 3, pendiente de validar con una cuenta real): autorizas tu cuenta en themoviedb.org y se leen tus valoraciones, favoritos y pendientes. Solo para cuentas reales; requiere `TMDB_API_READ_TOKEN` en el servidor |
| Cuenta local real (`pnpm user:local`) | **Real** (`dataset = live`), con identidad de desarrollo y código de un solo uso. No es autenticación de producción |
| Last.fm, Google, Apple Music | **Pendientes** (fases 4 y 11). Se muestran como «Próximamente» |
| Identidad | **De desarrollo** (JWT firmado por la API con `DEMO_MODE`). No es autenticación de producción |
| Recomendaciones, afinidad, almas gemelas, Trending | **Pendientes** (fases 5–8). La app no muestra ninguna inventada |

## Requisitos

Comprobado en Windows 11 con:

- Node.js 24 (probado 24.21.0) y pnpm 11 (probado 11.19.0; `corepack enable` o `npm i -g pnpm@11`)
- Docker Desktop con Docker Compose v2 (probado Docker 29.8, Compose 5.5)
- Git
- Teléfono con **Expo Go para el SDK 57** (Android 57.0.9 / iOS 57.0.9) en la misma red que el PC

## Puesta en marcha en el PC

Ejecuta cada comando desde la carpeta del repositorio.

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm setup
```

Crea `.env` con secretos aleatorios (ignorado por Git) y `apps/mobile/.env` con la URL de la API vista desde el
teléfono (en este PC, `http://192.168.1.16:3100`). Si detecta una IP equivocada: `pnpm setup --ip <IP-del-PC>`.

```bash
pnpm services:up
```

Resultado esperado: `Container appinity-claude-postgres Healthy` y `Container appinity-claude-redis Healthy`
(PostgreSQL 17 + PostGIS 3.5 en `127.0.0.1:5442`, Redis 7.4 en `127.0.0.1:6390`, proyecto Docker `appinity-claude`).

```bash
pnpm db:migrate
```

Resultado esperado: `✔ Migraciones aplicadas (… ms) en appinity_claude`. Es idempotente.

```bash
pnpm db:seed
```

Resultado esperado (primera vez):

```text
✔ Usuarios simulados: 6 (dataset demo)
✔ Catálogo real (instantánea Wikidata/Commons): 108 objetos, 108 nuevos
  · demo_laura  fixture_screen    partial   nuevas 9, … · 1 error(es) parcial(es)
  · demo_laura  fixture_diary     succeeded nuevas 8, …
  … (14 syncs)
✔ 82 imágenes en cola para cachear (las procesa pnpm worker)
```

El error parcial de Laura es **intencionado**: un registro con valoración 11 en una escala 1–10 demuestra la
validación en runtime sin detener el resto del sync. Repetir `pnpm db:seed` da `0 nuevos` y
`nuevas 0, actualizadas 0, sin cambios N` en todos los syncs: no hay duplicados.

Arranca API y worker, cada uno en su terminal:

```bash
pnpm api
```

```bash
pnpm worker
```

Con el worker arrancado, las 82 imágenes se descargan una vez de Wikimedia Commons (unos 20 s, 24 MB en `.data/media`)
y a partir de ahí el teléfono las recibe de la API por la red local.

Comprueba el estado:

```bash
pnpm doctor
```

Resultado esperado: servicios `healthy`, `http://127.0.0.1:3100/health → ok` con database, postgis, redis y worker
en OK, y `192.168.1.16 … → API accesible`.

## Probar en el teléfono con Expo Go

Todas las dependencias nativas (Reanimated, Gesture Handler, SecureStore, Location, Image, WebBrowser) están en
Expo Go, así que **no hace falta un development build**.

1. **Expo Go del SDK 57.**
   - Android: instala o actualiza Expo Go desde Google Play. Si tienes otra versión instalada para otro proyecto
     (el emulador de este PC tiene Expo Go 55.0.7), ten en cuenta que Expo Go solo abre un SDK; puedes descargar
     la versión exacta desde [expo.dev/go](https://expo.dev/go).
   - iPhone: Expo Go de la App Store ya soporta el SDK 57. **Desde septiembre de 2026 exige iniciar sesión**
     con la misma cuenta de Expo (gratuita) en el teléfono (avatar arriba a la derecha) y en el PC
     (`npx expo login`). Android no lo exige.
2. **Misma red.** PC por Ethernet y móvil por Wi-Fi conectados al mismo router sirven, salvo aislamiento de
   clientes o red de invitados.
3. **Comprueba la red antes de abrir la app.** En el navegador del teléfono abre `http://192.168.1.16:3100/health`.
   Debe verse un JSON con `"status":"ok"`.
4. **Arranca Metro** (en otra terminal):

   ```bash
   pnpm mobile
   ```

   Usa el puerto 8091 para no chocar con otros proyectos. Escanea el QR con Expo Go (Android) o con la cámara
   (iPhone). Si no aparece el QR, en Expo Go introduce `exp://192.168.1.16:8091`.

### Recorrido de aceptación

| # | Dónde | Qué hacer | Resultado esperado |
|---|---|---|---|
| 1 | Pantalla inicial | Mirar la tarjeta **Conexión con la API** | «Conectada», con Base de datos, PostGIS, Redis y Worker en OK |
| 2 | Pantalla inicial | Elegir **Laura (demo)** | Aparecen las pestañas **Inicio, Categorías, Personas, Perfil** |
| 3 | Inicio | Leer las tarjetas | «APPINITY está aprendiendo tus gustos», aviso de que el carrusel llega en las fases 7–8 y «28 objetos con evidencia» |
| 4 | Inicio → **Ver el modelo de datos de la demo** | Revisar las filas | Cada fila muestra Conocido, Consumido y Preferencia por separado. «—» = sin evidencia (NULL) |
| 5 | Modelo → Videojuegos | Mirar **Mindustry** | Conocido 1.00 · Consumido 0.00 · Preferencia «—», etiqueta «Comprado, 0 horas» |
| 6 | Modelo → Películas | **Dr. Strangelove** y **Some Like It Hot** | Watchlist: consumido 0.00 y «—»; visto sin nota: consumido 1.00 y «—» |
| 7 | Modelo → Películas → **Casablanca** | Abrir el detalle | 3 fuentes y 4 evidencias en un solo objeto, preferencia +0.78; el like de menor prioridad aparece como ignorado y una valoración antigua como sustituida |
| 8 | Modelo → Cultura → **MACBA** | Abrir el detalle | Preferencia −0.50: la reseña negativa prevalece sobre la asistencia +1 |
| 9 | Modelo → Libros | **Orgullo y prejuicio** y **La Regenta** | La edición con ISBN cuenta para la obra; La Regenta se resolvió sin IDs y su fecha tiene «precisión: year» |
| 10 | Categorías → cualquier categoría | Ver la cuadrícula | Imágenes reales; los objetos sin imagen libre (p. ej. Stardew Valley, Robot Dreams, Crims) muestran la imagen de sustitución de su categoría, no una foto inventada |
| 11 | Detalle de un objeto con imagen | Sección **Imagen** | Licencia (y autor si existe) con enlace a Wikimedia Commons |
| 12 | Perfil → Fuentes | **Resincronizar todo** en una fuente | La última ejecución pasa a «correcto · nuevas 0 · actualizadas 0 · sin cambios N» |
| 13 | Perfil → Fuentes | **Desconectar y borrar lo importado** en «Demo · Actividad y lugares» y volver a **Conectar** | Las evidencias de esa fuente desaparecen del modelo (Casablanca baja a 2 fuentes) y vuelven al reconectar |
| 14 | Perfil → Ajustes | Cambiar idioma, zona, radio, contactos y notificaciones | Se guardan en la API; el idioma cambia toda la interfaz |
| 15 | Perfil | **Cambiar de usuario de demo** → **Sam (demo)** | Modelo vacío («Este usuario no tiene evidencias…»): falta de datos, no ceros |
| 16 | Personas | Leer | Almas gemelas y amigos pendientes, sin porcentajes |

Para volver al estado inicial de la demo: `pnpm db:seed`.

## Conectar tu cuenta de Steam (datos reales)

APPINITY identifica tu cuenta con **OpenID** (inicias sesión en la web de Steam; APPINITY nunca ve tu contraseña) y
lee tu biblioteca y horas con la **Steam Web API** usando una clave que solo vive en el `.env` de tu PC. Los datos se
guardan únicamente en la base de datos local.

1. **Crea tu clave de la Steam Web API** en <https://steamcommunity.com/dev/apikey> con tu cuenta de Steam. Steam
   pide un nombre de dominio: para uso local sirve `localhost`. Hay que aceptar los
   [Terms of Use](https://steamcommunity.com/dev/apiterms). Steam puede exigir que la cuenta no sea «limitada»
   (con alguna compra realizada).
2. **Guárdala sin pegarla en ningún chat**, en tu terminal:

   ```bash
   pnpm secret:set STEAM_WEB_API_KEY
   ```

   Pide el valor mostrando un `*` por carácter (nunca el valor), comprueba que tiene 32 caracteres hexadecimales y lo
   escribe en `.env` (ignorado por Git). En PowerShell, pega con **clic derecho**; si no aparecen asteriscos, copia la
   clave y usa el portapapeles:

   ```bash
   pnpm secret:set STEAM_WEB_API_KEY --clipboard
   ```

   Alternativa: abrir `.env` con un editor y completar `STEAM_WEB_API_KEY=`. No compartas la clave en chats ni
   capturas: si se expone, anúlala en la página de Steam y crea otra.
3. **Crea tu cuenta local real** (solo desarrollo):

   ```bash
   pnpm user:local --handle tu_handle --name "Tu nombre" --country ES
   ```

   Muestra **una sola vez** un código como `ABCD-EFGH-JKLM`. Si lo pierdes, repite el comando: se genera otro y las
   sesiones anteriores dejan de valer.
4. **Reinicia** `pnpm api` y `pnpm worker`. El worker debe decir `Steam activo (syncs cada 24 h)`.
5. **En el teléfono**: Perfil → «Cambiar de usuario de demo» → abajo, **Cuenta local real** → handle y código.
   Verás el aviso verde «DATOS REALES · cuenta local de desarrollo».
6. Perfil → Fuentes → Steam → botón **Sign in through Steam**. Se abre Steam: inicia sesión (y confirma con Steam
   Guard si te lo pide). Al terminar vuelve a la app con «Cuenta conectada».
7. La primera sincronización se lanza sola. En unos segundos verás «Última ejecución: correcto · nuevas N» y tus
   juegos en **Ver el modelo de datos** y en Categorías → Videojuegos.

Comprobaciones esperadas:

- Un juego comprado y nunca jugado: Conocido 1.00 · Consumido 0.00 · Preferencia «—».
- Uno jugado menos de 2 h: Consumido 1.00 · Preferencia «—». Uno con muchas horas: preferencia positiva («conducta fuerte»).
- **Sincronizar** otra vez: «nuevas 0 · actualizadas 0 · sin cambios N» (sin duplicados).
- **Desconectar y borrar lo importado**: desaparecen tus juegos y se olvida el SteamID.

Privacidad de Steam: con **tu propia clave**, Steam devuelve tu biblioteca aunque tu perfil sea privado. Para otras
cuentas, «Mi perfil» y «Detalles de juegos» deben ser públicos; si no, la app muestra «Requiere tu acción» con la
instrucción y conserva lo ya importado.

### Si el teléfono no alcanza la API

- `localhost` en el teléfono es el propio teléfono: la URL debe usar la IP del PC. `pnpm setup` la escribe en
  `apps/mobile/.env`; si la cambias, reinicia Metro con `pnpm --filter @appinity/mobile start:clear`.
- Sin `apps/mobile/.env`, la app usa la IP de Metro con el puerto 3100 (se ve en Perfil → Diagnóstico).
- Firewall de Windows: en este PC existe una regla de entrada «Node.js JavaScript Runtime» que permite `node.exe`
  en el perfil **Público**, que es el de la red Ethernet. Si Windows vuelve a preguntar, permite el acceso. Si aun así
  falla, crea como administrador una regla de entrada TCP para los puertos 3100 y 8091 limitada a tu red. Este
  proyecto no cambia la configuración del sistema.
- `pnpm doctor` comprueba servicios, API local y API por cada IP de red.

## Conectar tu cuenta de TMDb (datos reales)

Hay **dos permisos distintos**:

- **Token de la aplicación** (`TMDB_API_READ_TOKEN`): identifica a APPINITY ante TMDb. Se configura una vez en el
  servidor (tu PC) y nunca llega al teléfono.
- **Autorización de tu cuenta**: apruebas el acceso en themoviedb.org desde el teléfono. TMDb entrega una sesión que
  APPINITY guarda **cifrada** en la base de datos local. Se usa solo para **leer** tus valoraciones, favoritos y
  pendientes de películas y series; nunca escribe en tu cuenta.

Pasos (en la terminal de comandos, PowerShell):

1. Si no tienes cuenta, créala en <https://www.themoviedb.org/signup> y confirma el correo.
2. Ve a <https://www.themoviedb.org/settings/api> y solicita una clave de API (tipo **Developer**, uso personal y no
   comercial; como URL vale `http://localhost`). Acepta las condiciones.
3. En esa página verás dos valores. Copia el **«API Read Access Token»** (largo, empieza por `eyJ`), **no** la
   «API Key» corta de 32 caracteres.
4. Guárdalo sin pegarlo en ningún chat:

   ```bash
   pnpm secret:set TMDB_API_READ_TOKEN --clipboard
   ```

   Salida esperada: `✔ TMDB_API_READ_TOKEN guardada en .env (… caracteres)`. Si copiaste la clave corta, te lo dice
   y no guarda nada. Después copia cualquier otro texto para vaciar el portapapeles.
5. **Reinicia la API y el worker** (cada uno en su terminal: `Ctrl+C` y vuelve a lanzarlo). Ambos compilan antes de
   arrancar.

   ```bash
   pnpm api
   ```

   ```bash
   pnpm worker
   ```

   El worker debe mostrar `· TMDb activo`. Si dice `TMDb sin configurar`, el token no está en `.env`.
6. **Reinicia Metro** (`Ctrl+C` en su terminal) para cargar la nueva pantalla de créditos y vuelve a abrir la app en
   Expo Go:

   ```bash
   pnpm mobile
   ```

7. En el teléfono, con tu **cuenta local real**: Perfil → Fuentes → TMDb → **Conectar**. Se abre themoviedb.org:
   inicia sesión allí y pulsa **Aprobar**. Vuelves a la app con «Cuenta conectada» y la primera sincronización se
   lanza sola.

Comprobaciones esperadas:

- Película **valorada**: Conocido 1.00 · Consumido 1.00 · Preferencia según tu nota (10 → +1,00; 0,5 → −1,00;
  8,5 → +0,68), base «valoración explícita».
- **Favorita** sin valorar: Consumido 0.00 · Preferencia +0,80, base «like explícito».
- **Pendiente** (watchlist): Conocido 1.00 · Consumido 0.00 · Preferencia «—» (no es un rechazo).
- Una película y una serie con el mismo número en TMDb aparecen como objetos distintos.
- **Sincronizar** otra vez: «nuevas 0 · actualizadas 0 · sin cambios N».
- Quita un favorito en TMDb y sincroniza: esa evidencia desaparece y el resto se mantiene.
- **Desconectar**: la app indica que TMDb confirmó la revocación. Con **Desconectar y borrar lo importado** desaparecen
  también tus películas y series.
- Perfil → **Créditos y fuentes de datos**: logo y aviso de TMDB.

Si revocas el acceso desde la web de TMDb, la conexión pasa a «Requiere tu acción · vuelve a conectar TMDb» y conserva
lo ya importado; desconéctala y vuelve a conectarla.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm setup` | Crea `.env` y `apps/mobile/.env` (secretos aleatorios e IP de red) |
| `pnpm services:up` / `services:down` | Arranca o para PostgreSQL+PostGIS y Redis (Docker) |
| `pnpm build` | Compila todos los paquetes TypeScript (`tsc -b`) |
| `pnpm db:migrate` | Aplica migraciones versionadas (Drizzle) |
| `pnpm db:seed` | Seed determinista de la demo: usuarios, catálogo, conexiones fixture y syncs (solo `DEMO_MODE=true`) |
| `pnpm db:reset` | Vacía la BD de desarrollo, migra y siembra (solo `DEMO_MODE=true`) |
| `pnpm user:local --handle h --name "N"` | Crea o regenera una cuenta local real (dataset `live`) y muestra su código una vez |
| `pnpm secret:set STEAM_WEB_API_KEY [--clipboard]` | Guarda la clave de Steam en `.env` sin mostrarla (escrita o desde el portapapeles) |
| `pnpm secret:set TMDB_API_READ_TOKEN [--clipboard]` | Guarda el token de lectura de TMDb en `.env` sin mostrarlo |
| `pnpm api` / `pnpm worker` | API NestJS en `0.0.0.0:3100` / worker BullMQ (syncs, syncs programados cada hora, caché de imágenes y renovación diaria del contenido de TMDb) |
| `pnpm dev` | Compilación en modo watch + API + worker |
| `pnpm mobile` | Metro/Expo en el puerto 8091 |
| `pnpm --filter @appinity/mobile web` | Vista web de desarrollo en el puerto 8092 (solo verificación; no sustituye al teléfono) |
| `pnpm doctor` | Diagnóstico de servicios y red |
| `pnpm lint` | ESLint (incluye la regla que impide importar proveedores en `packages/algorithms`) |
| `pnpm typecheck` | `tsc` de paquetes, tests y app móvil |
| `pnpm test` | Compila y ejecuta los tests unitarios y de integración (requiere `pnpm services:up`) |
| `pnpm fixtures:catalog` | Regenera la instantánea de catálogo desde Wikidata/Commons (requiere red; tarea manual) |

Los tests de integración usan la base de datos `appinity_claude_test` y la vacían en cada ejecución. Nunca tocan
`appinity_claude`.

## Estructura

```text
apps/api             API NestJS: health, identidad de desarrollo, /v1/me, fuentes, conexiones, catálogo, perfiles, imágenes
apps/mobile          Expo SDK 57 + Expo Router: cuatro pestañas, demo del modelo, catálogo, detalle, fuentes, ajustes
packages/shared      Categorías, contratos (NormalizedObservation, ProfileSourceAdapter, CatalogProvider), DTOs, Zod
packages/i18n        Textos es/en
packages/algorithms  Normalización de escalas y consolidación v1 (sin dependencias de proveedores)
packages/database    Esquema Drizzle, migraciones SQL, cliente, cifrado de credenciales
packages/catalog     Instantánea Wikidata/Commons, resolución de entidades, imágenes, fallback, almacenamiento
packages/integrations Registro de adapters, profile/fixture y profile/steam (manifest, auth, client, sync, mapper, schemas, constants, fixtures)
packages/ingestion   Pipeline de sync, conexiones, recálculo de perfiles, colas y seed de demo
workers/sync-worker  Worker BullMQ: profile-sync, catalog-images y latido
scripts/             setup, doctor y generador de la instantánea de catálogo
docs/                Especificación, arquitectura, decisiones, progreso, capacidades de integración
```

Más detalle en [docs/architecture.md](docs/architecture.md), [docs/decisions.md](docs/decisions.md) y
[docs/integration-capabilities.md](docs/integration-capabilities.md).

## Seguridad y datos

- Secretos solo en `.env` (ignorado por Git), generados por `pnpm setup`. Las credenciales por usuario de los
  proveedores (hoy, la sesión de TMDb) se guardan cifradas con AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`, ligadas a
  su conexión) y solo se descifran en memoria del servidor. Si cambias esa clave, hay que volver a conectar TMDb.
- Servicios Docker solo en `127.0.0.1`. La API escucha en `0.0.0.0:3100` para el teléfono de la red local.
- Todas las rutas, salvo `/health`, la identidad de desarrollo, `/media/catalog/*` y `/static/fallback/*`, exigen
  sesión. El usuario sale del token y los recursos ajenos responden 404.
- La identidad de desarrollo solo funciona con `DEMO_MODE=true` y fuera de producción, para usuarios `dataset = demo`
  o para cuentas locales reales con su código vigente. La API se niega a arrancar con `NODE_ENV=production` y
  `DEMO_MODE` activo.
- Steam: la clave de la Web API solo está en el servidor; del usuario solo se guarda el SteamID mientras la conexión
  está activa. Un SteamID no puede vincularse a dos usuarios a la vez. El arte de Steam se usa solo como referencia.
- TMDb: el token de la aplicación solo está en el servidor; la sesión del usuario se guarda cifrada, nunca aparece en
  respuestas ni logs y se revoca en TMDb al desconectar. Los pósters son referencias al CDN de TMDb (no se copian) y
  el contenido de TMDb se renueva o retira antes de 6 meses, como exigen sus condiciones. Uso solo no comercial hasta
  firmar un acuerdo con TMDb.
- Los datos de la demo (`dataset = demo`) nunca se mezclan con datos reales: un usuario real no puede conectar
  fuentes simuladas y la resolución de objetos reales no reutiliza el catálogo de la demo.
- La ubicación se guarda como zona aproximada (~1 km), sin historial.
- Fuentes de los requisitos de Expo Go: [Login now required for running projects in Expo Go](https://expo.dev/changelog/expo-go-57-login),
  [Expo Go sign-in required](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/), [Expo changelog](https://expo.dev/changelog).

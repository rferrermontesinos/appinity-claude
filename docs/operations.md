# Operación de APPINITY (beta) · fase 13

Cómo desplegar, configurar, respaldar y revisar el servidor. Nada de esto contrata servicios: indica qué haría falta y
qué está ya preparado y probado.

## Qué está comprobado (2026-10-15)

- **Imagen** (`Dockerfile`): se construye. La API y el worker comparten imagen, se ejecutan sin root (`appinity`) y no
  llevan secretos dentro.
- **Pila de producción** (`docker-compose.prod.yml`), levantada en local con otro nombre de proyecto y otro puerto:
  - PostGIS 17 y Redis persistentes;
  - migraciones aplicadas desde cero;
  - API en modo producción (`demoMode: false`, `devAuth: false`) y worker con latido;
  - `/v1/dev/session` responde 404 y `/v1/me` sin sesión, 401.
- **Salvaguardas**: la API se niega a arrancar con `NODE_ENV=production` y `DEMO_MODE`/`DEV_AUTH_ENABLED`, o sin
  `AUTH_SECRET` (probado con el contenedor real).
- **Copias de seguridad**: `pnpm db:backup` crea un volcado y se restauró completo (13 migraciones, PostGIS) en otra base
  de datos. Desde la fase B9 van cifradas y `pnpm db:restore` las comprueba (ver «Copias de seguridad»).
- **Imagen de nuevo (2026-11-22, fase B10)**: construida y arrancada en modo producción contra un PostGIS vacío: las 24
  migraciones, `/health` correcto y sin detalles, `/v1/dev/session` 404, `/v1/me` 401, las páginas legales y el worker
  con latido. Desde B10, un fallo de compilación para la construcción (antes lo ocultaba un `|| true`) y la imagen ya no
  lleva las herramientas de desarrollo (tests, lint, drizzle-kit). Pesa unos 1,2 GB porque el modo plano de pnpm
  arrastra paquetes de la app móvil.

## Despliegue

1. Servidor con Docker y Docker Compose, y un dominio con HTTPS: un proxy (Caddy o Nginx) delante de
   `127.0.0.1:3100`. La API no debe exponerse sin TLS.
2. `.env.production` en el servidor (fuera de Git; ver «Secretos»).
3. Arranque:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   ```
4. Comprobación: `curl https://TU-DOMINIO/health` debe dar `status: ok` y `mode.environment: production`.
5. Actualizar: `git pull` y el mismo comando. Las migraciones se aplican solas (servicio `migrate`) antes de API y worker.

## Secretos (`.env.production`)

| Variable | Para qué | Cómo obtenerla |
|---|---|---|
| `POSTGRES_PASSWORD` | Base de datos | Aleatoria larga |
| `AUTH_SECRET` | Firma de sesiones (obligatoria) | Aleatoria, ≥ 32 caracteres |
| `CREDENTIALS_ENCRYPTION_KEY` | Cifrado de credenciales de fuentes | 32 bytes en base64 (como genera `pnpm setup`) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | «Continuar con Google» y Google Data Portability | Google Cloud Console |
| `GOOGLE_SIGNIN_REDIRECT_URI` | `https://TU-DOMINIO/v1/auth/google/callback` | Autorizarla en el cliente OAuth |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://TU-DOMINIO/v1/connect/google_portability/callback` | Ídem |
| `PUBLIC_API_URL` | `https://TU-DOMINIO` (vueltas de Steam y enlaces). **Obligatoria**: la API no arranca en producción sin ella | — |
| `APP_WEB_ORIGIN` | Origen https de la app web, si se publica | — |
| `STEAM_WEB_API_KEY` | Steam | steamcommunity.com/dev/apikey |
| `REVENUECAT_WEBHOOK_AUTH` | Webhook de Premium | Panel de RevenueCat |
| `EXPO_ACCESS_TOKEN` | Solo con la seguridad reforzada de push | EAS |
| `OUTBOUND_CONTACT` | Contacto del proyecto (URL o email) en el User-Agent de Wikidata, Wikimedia y Nominatim. Vacía: el origen de `PUBLIC_API_URL`. Nunca un dato personal | Email de soporte o web del proyecto |
| `CATALOG_USER_AGENT` | Sustituye el User-Agent entero del worker (raro: basta `OUTBOUND_CONTACT`) | «APPINITY/0.1 (+contacto)» |
| `NOMINATIM_URL` | Geocodificación propia (recomendada con muchos usuarios) | Instancia propia de Nominatim |
| `LEGAL_CONTROLLER_NAME` | Responsable en la política, las condiciones y la página de baja. Sin ella, las páginas muestran «[pendiente: …]» y la API lo avisa al arrancar | Nombre y apellidos o razón social del titular |
| `LEGAL_CONTACT_EMAIL` | Email de privacidad, derechos y bajas (enlace `mailto:` en las tres páginas) | Un buzón que el titular lea |
| `LEGAL_CONTROLLER_ID` / `LEGAL_CONTROLLER_ADDRESS` | NIF y dirección postal del responsable. Opcionales; la LSSI los exige si hay actividad económica | Que lo confirme la revisión legal |
| `SENTRY_DSN` | Avisos de errores de la API, el worker y la app (fase B4). Vacía: apagados, no sale nada. Con ella, la política de privacidad nombra a Sentry | Proyecto de Sentry en la región de la UE (ver «Avisos de errores») |
| `SENTRY_ENVIRONMENT` | Entorno que ve Sentry (p. ej. `beta`). Vacía: `NODE_ENV` | — |
| `BACKUP_ENCRYPTION_KEY` | Cifrado de las copias de seguridad (fase B9). Sin ella, `db:backup` no hace copias | 32 bytes en base64 (como genera `pnpm setup`). **Guardarla también en un gestor de contraseñas** |
| `BACKUP_COPY_TO` | Carpeta donde dejar además cada copia (otro disco, una carpeta sincronizada). Opcional | — |

**Rotación**:
- `AUTH_SECRET`: cambiarlo invalida todos los access tokens (las sesiones se renuevan con su refresh token).
- `CREDENTIALS_ENCRYPTION_KEY`: si cambia, obliga a reconectar las fuentes.
- `BACKUP_ENCRYPTION_KEY`: las copias anteriores siguen necesitando la clave de entonces (guardar las dos hasta que roten).

## Avisos de errores (Sentry, fase B4)

Apagados mientras `SENTRY_DSN` esté vacía: ni red ni manejadores, la beta funciona igual. Para activarlos:

1. Crear una cuenta en sentry.io con **región de datos UE** (Fráncfort; los DSN terminan en `.ingest.de.sentry.io`) y un
   proyecto de tipo Node.js. El plan gratuito basta para la beta.
2. En el proyecto, **Settings → Security & Privacy**: activar «Prevent storing of IP addresses» y dejar activados los
   filtros de datos sensibles del servidor (segunda red por si algo se escapara del filtro propio).
3. En **Settings → Client Keys (DSN)**, copiar el DSN y ponerle un **límite de eventos** (p. ej. 100 por hora): protege la
   cuota si alguien abusa del endpoint público de la app.
4. `SENTRY_DSN=<DSN>` y `SENTRY_ENVIRONMENT=beta` en `.env.production` y reiniciar API y worker. Al arrancar, la API
   escribe «Avisos de errores activos» y el worker lo añade a su línea de arranque (en local, `pnpm doctor` también lo
   muestra).

Qué se envía y qué no:

| Origen | Se avisa | No se avisa |
|---|---|---|
| API | Errores 5xx (salvo 503) con la ruta como patrón (`GET /v1/people/:id`) y el código; excepciones sin capturar | 4xx, 503 («no configurado», Redis o un proveedor caídos), la URL, la petición, la persona |
| Worker | Último intento fallido de un trabajo, con la cola y el tipo; un proveedor caído tras todos los reintentos va como `warning` | Reintentos intermedios, `UnrecoverableError` (perfil privado, clave no válida…), los datos del trabajo |
| App | Errores de JavaScript sin capturar y pantallas que no se pudieron pintar, vía `POST /v1/diagnostics/app-errors` (como mucho 10 por sesión, sin repetir; la API reenvía 100 por hora como mucho) | Sesión, persona, IP, la URL con identificadores (solo el patrón de la pantalla). En desarrollo no se envía nada |

Antes de salir, todo evento pasa por `packages/observability` (`scrubEvent`): quita emails, tokens y JWT, tokens de push,
parámetros secretos de URL, UUID, SteamID, IPs y secretos largos de cualquier texto; las claves que suenan a dato
personal o secreto se sustituyen enteras; y las rutas de la pila quedan relativas al repositorio (sin `C:\Users\<nombre>`).
La app no lleva el SDK de Sentry ni su DSN: los cierres nativos (fuera de JavaScript) se ven en Android vitals de Google
Play Console.

## Copias de seguridad (cifradas desde la fase B9)

- **Clave**: `BACKUP_ENCRYPTION_KEY` (32 bytes en base64). `pnpm setup` la crea en `.env` si no está; en producción va
  en `.env.production`. **Guárdala también fuera del equipo** (gestor de contraseñas): sin ella no se puede restaurar
  ninguna copia, y si se pierde el disco se pierde con él. Cambiarla no estropea las copias anteriores, pero para
  restaurarlas hace falta la clave de entonces (el comando dice la huella de cada una).
- **Hacer una copia**:
  ```bash
  pnpm db:backup                                   # desarrollo / PC de la beta (contenedor appinity-claude-postgres)
  node --env-file=.env.production scripts/backup-db.mjs --container appinity-claude-prod-postgres-1   # pila de producción
  ```
  Vuelca la base con `pg_dump` y la cifra al vuelo con AES-256-GCM (el volcado sin cifrar nunca toca el disco). Deja
  `backups/appinity_claude-<fecha>.dump.enc` (fuera de Git) y conserva las 14 más recientes (`--keep`).
- **Fuera del equipo**: `BACKUP_COPY_TO=<carpeta>` en `.env` (o `--copy-to <carpeta>`) deja además cada copia en otra
  carpeta, por ejemplo otro disco o una carpeta sincronizada con Google Drive o OneDrive. Como van cifradas, se pueden
  guardar en la nube. Esa carpeta rota igual que `backups/`.
- **A diario** (la política de privacidad promete que lo borrado desaparece de las copias en 14 días, y eso solo se
  cumple con una copia al día y la rotación). En Windows, una tarea programada (en una terminal, cambiando la ruta):
  ```bat
  schtasks /Create /TN "APPINITY CLAUDE copia diaria" /SC DAILY /ST 03:30 /TR "cmd /c cd /d C:\ruta\appinity-claude && pnpm db:backup >> backups\copias.log 2>&1"
  ```
  El PC tiene que estar encendido a esa hora (durante la beta lo está, porque sirve la API). `pnpm doctor` avisa si la
  última copia tiene más de 36 horas. En un servidor Linux, lo mismo con cron.
- **Comprobar una copia** (una vez al mes y siempre después de cambiar la clave):
  ```bash
  pnpm db:restore backups/<copia>.dump.enc
  ```
  Comprueba la integridad (si se ha tocado un solo byte, falla), la restaura en una base temporal
  (`appinity_claude_restore_check`), enseña cuántas migraciones, personas, evidencias, votos y mensajes tiene, y la
  borra. No toca la base de la app.
- **Restaurar de verdad**: parar la API y el worker y
  ```bash
  pnpm db:restore backups/<copia>.dump.enc --confirm appinity_claude
  ```
  Si hay conexiones abiertas, se niega. Antes guarda una copia cifrada del estado actual (por si hay que volver atrás),
  restaura la copia entera en otra base y solo entonces cambia una por otra; si algo falla, la base de la app queda como
  estaba. Si la copia es de una versión anterior, después `pnpm db:migrate`. Con la pila de producción:
  `node --env-file=.env.production scripts/restore-db.mjs <copia> --container appinity-claude-prod-postgres-1 --confirm appinity_claude`
  (con `docker compose -f docker-compose.prod.yml stop api worker` antes y `start api worker` después).
- Las copias antiguas sin cifrar (`.dump`, de antes de B9) se siguen pudiendo restaurar y la rotación las va borrando.
- Redis guarda colas y estados temporales (AOF activado). No contiene datos que no se puedan regenerar.

## Datos y privacidad

- **Reales y sintéticos nunca se mezclan**:
  - las cuentas de producción son siempre `dataset = live`;
  - la demo (`dataset = demo`) solo existe con `DEMO_MODE` (prohibido en producción);
  - ranking, afinidades, recomendaciones y chat filtran por dataset.
- **Tokens**:
  - la API nunca devuelve tokens de proveedores;
  - las credenciales de fuentes van cifradas (AES-256-GCM, ligadas a la conexión);
  - los refresh tokens de sesión solo se guardan como hash.
- **Eliminar la cuenta** (`DELETE /v1/me` y `pnpm account:delete`, el mismo `AccountService`):
  - desconecta cada fuente pidiendo al proveedor que anule el permiso (un proveedor que no responde no impide el borrado);
  - después borra al usuario y, en cascada, todo lo suyo: perfil, evidencia, votos, afinidades, amistades, seguimientos,
    chats (también para la otra persona), comentarios de la beta, sesiones, tokens push y entitlements. Los eventos de compra de RevenueCat se
    conservan sin el usuario (`user_id` a NULL).

### Peticiones de derechos por email (fase B3)

La página pública `https://TU-DOMINIO/legal/eliminar-cuenta` (la pide Google Play) y la política de privacidad dan el
email de `LEGAL_CONTACT_EMAIL`. Cuando llega una petición:

1. **Comprobar la identidad**: el email del remitente tiene que ser el de la cuenta de Google con la que entra en
   APPINITY. Si escribe desde otro, pedirle que lo haga desde ese.
2. **Copia de sus datos** (acceso y portabilidad):
   ```bash
   pnpm account:export --email persona@gmail.com
   ```
   Escribe `exports/appinity-<handle>-<fecha>.json` (fuera de Git; `--out ruta.json` para otra ruta). Incluye cuenta,
   gustos, evidencias, votos, amistades, chat, comentarios de la beta y ajustes. Deja fuera secretos (credenciales, huellas de sesión, tokens
   push), los mensajes que escribieron otras personas (solo cuántos) y las afinidades. Enviarla solo a esa persona, por un
   canal seguro, y borrarla después.
3. **Eliminar la cuenta**:
   ```bash
   pnpm account:delete --email persona@gmail.com                    # enseña qué cuenta es; no borra nada
   pnpm account:delete --email persona@gmail.com --confirm <handle>  # la elimina como «Eliminar mi cuenta»
   ```
   Se ejecuta donde corre la API (usa su `.env` para anular los permisos en los proveedores). Las personas de la demo no
   se eliminan así. Con la pila de Docker de producción, dentro del contenedor de la API:
   `docker compose -f docker-compose.prod.yml --env-file .env.production exec api node apps/api/dist/cli/account.js delete --email …`
   (y `… account.js export --email … --out /tmp/copia.json`, que después se copia con `docker compose cp`).
4. **Contestar** en un plazo máximo de un mes desde la petición (RGPD, art. 12.3).

## Comentarios de la beta (fase B5)

Los testers escriben desde **Perfil → Enviar comentario**. Se guarda el texto (hasta 2.000 caracteres) con su cuenta, la
versión de la app y la plataforma; nada más. Cupo: 10 por persona en 24 horas (y 10 envíos por minuto e IP). Para
leerlos:

```bash
pnpm feedback:list                    # los no leídos, los más recientes primero (50 como mucho)
pnpm feedback:list --mark-read        # los mismos y, al final, los marca como leídos
pnpm feedback:list --all --limit 200  # también los ya leídos
```

En el servidor, dentro del contenedor de la API:
`docker compose -f docker-compose.prod.yml --env-file .env.production exec api node packages/ingestion/dist/cli/list-feedback.js`.
Los comentarios salen en la copia de datos de la persona (`pnpm account:export`) y se borran con su cuenta. La app no
contesta: si un comentario necesita respuesta, escribir al email de la cuenta desde el de soporte.

## Moderación (fase B9)

Desde la app, cualquiera puede bloquear y reportar a otra persona (acoso, spam, contenido inapropiado, suplantación u
otro, con una nota opcional). Google Play exige que los reportes se revisen y que se actúe. Revisarlos **a diario**
durante la beta:

```bash
pnpm reports:list                    # reportes pendientes, agrupados por persona reportada
pnpm reports:list --mark-reviewed    # los mismos y, al final, los marca como revisados
pnpm reports:list --all              # también los ya revisados
pnpm account:suspend --handle u_1a2b3c                      # enseña la cuenta; no cambia nada
pnpm account:suspend --handle u_1a2b3c --confirm u_1a2b3c   # la suspende
pnpm account:unsuspend --handle u_1a2b3c --confirm u_1a2b3c # levanta la suspensión
```

- **Suspender** cierra todas sus sesiones al momento. La persona ya no puede entrar (al intentarlo, la app le dice que
  la cuenta está suspendida y a qué email escribir) y desaparece para los demás en todas partes: almas gemelas,
  personas, chat, amistades, Trending y afinidades. Sus datos se conservan; al levantar la suspensión vuelve todo.
  Para borrarla del todo, `pnpm account:delete`.
- **Después de suspender**, escribir a la persona desde el email de contacto con el motivo y cómo pedir una revisión
  (lo dicen las condiciones). Ver [incidencias.md](incidencias.md#una-persona-reportada).
- En el servidor, dentro del contenedor de la API:
  `docker compose -f docker-compose.prod.yml --env-file .env.production exec api node packages/ingestion/dist/cli/moderation.js list`
  (o `suspend --handle … --confirm …`).

## Métricas de la beta (fase B9)

```bash
pnpm beta:metrics                     # todas las cuentas reales
pnpm beta:metrics --since 2026-12-01  # solo quienes se dieron de alta desde el inicio de la ola
pnpm beta:metrics --json              # para guardarlas o compararlas
pnpm beta:metrics --dataset demo      # para probar el comando con la demo
```

Sin terceros: solo recuentos sacados de la base de datos, nunca nombres. Responde a los criterios de cada ola
([fases-beta.md](fases-beta.md)): alta completa y gustos importados en menos de 24 h; almas gemelas tras 48 h y la mezcla
de Inicio (consenso y descubrimiento frente a Trending y relleno); vuelta entre el día 7 y el 13; Trending, zona y push.
Al final dice cuántos reportes y comentarios quedan por revisar. En el servidor:
`docker compose -f docker-compose.prod.yml --env-file .env.production exec api node packages/ingestion/dist/cli/beta-metrics.js`.
Dos medidas son aproximadas y lo dicen:
- «alma gemela tras 48 h» se mira ahora, no a las 48 h exactas;
- «vuelve entre el día 7 y el 13» se deduce de lo que deja huella (votos, tarjetas vistas, mensajes enviados, sesiones y
  comentarios), porque la app no registra cada vez que se abre.

## Builds de la app (EAS)

`apps/mobile/eas.json` tiene tres perfiles:
- `development`: APK con cliente de desarrollo, contra la API del PC;
- `preview`: APK para testers;
- `production`: AAB para Google Play.

Las URL `CAMBIAR-…` se sustituyen por el dominio real. Hace falta `eas init` (crea el `projectId`, gratuito) y, para
el push, lo de la sección siguiente.

## Notificaciones push (fase B6)

El servidor envía el resumen (fase 12C) con el servicio de Expo. Desde B6, la app:
- crea el canal de Android «Resumen de APPINITY»;
- pide el permiso una sola vez, tras el alta, si la persona no ha desactivado las notificaciones;
- registra el teléfono en cada arranque y abre Inicio al tocar la notificación;
- da de baja el teléfono al cerrar sesión.

En Perfil → Ajustes → Notificaciones, la línea «En este teléfono» dice si llegan y, si no, por qué. Para que lleguen
de verdad faltan tres cosas del titular, todas gratuitas:

1. **Proyecto de EAS**: cuenta de Expo y `eas init` en `apps/mobile`, o `EAS_PROJECT_ID=<id>` en `apps/mobile/.env`
   (y en las variables del proyecto en EAS). Sin él, Ajustes dice «Pendiente: … proyecto de EAS».
2. **Firebase (FCM)**: un proyecto de Firebase con una app Android de paquete `dev.appinity.claude`. Su
   `google-services.json` va en `apps/mobile/google-services.json`, que Git ignora; en EAS, va en una variable de tipo
   fichero llamada `GOOGLE_SERVICES_JSON`.
3. **Clave de FCM V1 en EAS**: en Firebase, Configuración del proyecto → Cuentas de servicio → «Generar nueva clave
   privada». Se sube con `eas credentials` (Android → Push Notifications: FCM V1). El servicio de Expo la usa para
   entregar en Android; no va ni en Git ni en el servidor.

Después hace falta un APK nuevo: `pnpm android:build` en el PC (lee `apps/mobile/.env` y el `google-services.json`
local) o `eas build --profile preview`. **Expo Go no sirve**: en Android no admite push desde el SDK 53.

Para comprobarlo sin esperar al resumen de las 19:00:

```bash
pnpm push:test --handle <handle>   # una notificación de prueba a los teléfonos activos de esa persona
```

Tiene que llegar «Prueba de APPINITY», y al tocarla se abre Inicio. En el servidor:
`docker compose -f docker-compose.prod.yml --env-file .env.production exec worker node workers/sync-worker/dist/cli/push-test.js --handle <handle>`.
`EXPO_ACCESS_TOKEN` solo hace falta si se activa la seguridad reforzada de push en EAS.

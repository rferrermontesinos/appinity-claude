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
  de datos.

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

**Rotación**:
- `AUTH_SECRET`: cambiarlo invalida todos los access tokens (las sesiones se renuevan con su refresh token).
- `CREDENTIALS_ENCRYPTION_KEY`: si cambia, obliga a reconectar las fuentes.

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

## Copias de seguridad

- Diarias:
  ```bash
  node scripts/backup-db.mjs --container <contenedor-postgres> --keep 14
  ```
  Se programan con cron o con el programador de tareas.
- Contienen datos personales: guárdalas **cifradas** y fuera del servidor, con acceso restringido.
- **Retención**: 14 días (una copia diaria, se conservan 14). Una cuenta eliminada desaparece de las copias cuando
  caducan; así lo dicen la app al eliminar la cuenta, la política de privacidad y la página de baja. Si las copias no son
  diarias, esa promesa no se cumple: programarlas es parte de la puesta en marcha.
- Restaurar:
  ```bash
  docker exec -i <contenedor> pg_restore -U appinity_claude -d appinity_claude --clean --if-exists < backups/<archivo>.dump
  ```
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

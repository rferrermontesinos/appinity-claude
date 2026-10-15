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
| `PUBLIC_API_URL` | `https://TU-DOMINIO` (vueltas de Steam y enlaces) | — |
| `APP_WEB_ORIGIN` | Origen https de la app web, si se publica | — |
| `STEAM_WEB_API_KEY` | Steam | steamcommunity.com/dev/apikey |
| `REVENUECAT_WEBHOOK_AUTH` | Webhook de Premium | Panel de RevenueCat |
| `EXPO_ACCESS_TOKEN` | Solo con la seguridad reforzada de push | EAS |
| `CATALOG_USER_AGENT` | Identificarse ante Wikidata y OSM | «APPINITY/1.0 (contacto)» |
| `NOMINATIM_URL` | Geocodificación propia (recomendada con muchos usuarios) | Instancia propia de Nominatim |

**Rotación**:
- `AUTH_SECRET`: cambiarlo invalida todos los access tokens (las sesiones se renuevan con su refresh token).
- `CREDENTIALS_ENCRYPTION_KEY`: si cambia, obliga a reconectar las fuentes.

## Copias de seguridad

- Diarias:
  ```bash
  node scripts/backup-db.mjs --container <contenedor-postgres> --keep 14
  ```
  Se programan con cron o con el programador de tareas.
- Contienen datos personales: guárdalas **cifradas** y fuera del servidor, con acceso restringido.
- **Retención**: 14 días. Una cuenta eliminada desaparece de las copias cuando caducan. Así lo explica la app al
  eliminar la cuenta.
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
- **Eliminar la cuenta** (`DELETE /v1/me`):
  - desconecta cada fuente revocando el permiso en el proveedor;
  - después borra al usuario y, en cascada, todo lo suyo: perfil, evidencia, afinidades, amistades, chats, sesiones,
    tokens push y entitlements.

## Builds de la app (EAS)

`apps/mobile/eas.json` tiene tres perfiles:
- `development`: APK con cliente de desarrollo, contra la API del PC;
- `preview`: APK para testers;
- `production`: AAB para Google Play.

Las URL `CAMBIAR-…` se sustituyen por el dominio real. Hace falta:
- `eas init` (crea el `projectId`, gratuito);
- `expo-dev-client` y `expo-notifications` instalados con Metro parado (en Windows la instalación falló con los
  procesos abiertos);
- credenciales FCM para el push en Android.

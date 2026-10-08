# Progreso · APPINITY Claude

Leyenda: **Implementado** (código en el repositorio) · **Comprobado automáticamente** (tests o comandos
ejecutados aquí) · **Aceptado en dispositivo** (lo confirma el usuario en su teléfono).

| Fase | Estado | Evidencia / siguiente paso |
|---|---|---|
| 0 | Implementado y comprobado automáticamente. Aceptación en dispositivo pendiente | Ver entrega 2026-10-08 · fase 0 |
| 1 | Pendiente | Modelo de catálogo, observaciones, consolidación y fixtures |
| Aceptación de demo | Pendiente | Usuario prueba instalación, API y teléfono tras 0–1 |
| 2–4 | Pendiente | Steam, TMDb y Last.fm, en ese orden |
| 5–7 | Pendiente | Afinidad, Top 50 y recomendador |
| 8–10 | Pendiente | Home, Categories y social |
| 11 | Pendiente | Fuentes adicionales viables, una por tarea |
| 12 | Pendiente | Chat, Premium y notificaciones, por subentregas |
| 13 | Pendiente | Preparación y prueba de beta |

---

## Entrega 2026-10-08 · fase 0

Rama `fase-0`. Commit y PR: ver el resumen de la entrega en el historial de Git.

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

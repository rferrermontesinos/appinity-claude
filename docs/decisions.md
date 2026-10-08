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

# Arquitectura · APPINITY Claude

Documento vivo. Describe lo implementado y marca lo pendiente. Requisitos: [APPINITY_Especificacion.md](APPINITY_Especificacion.md).

## Vista general

```text
 Teléfono (Expo Go)                PC de desarrollo
 ┌──────────────────────┐   HTTP   ┌──────────────────────────────┐
 │ apps/mobile          │ ───────▶ │ apps/api (NestJS, :3100)     │
 │ Expo Router · 4 tabs │  LAN IP  │  guard global + auth dev     │
 │ TanStack Query       │          │  /health /v1/me /v1/dev      │
 │ Zustand + SecureStore│          └──────┬───────────────┬───────┘
 └──────────────────────┘                 │ Drizzle (pg)  │ ioredis / BullMQ
                                          ▼               ▼
                              PostgreSQL 17 + PostGIS   Redis 7.4
                              (:5442, appinity_claude)  (:6390)
                                          ▲               ▲
                                          │               │
                                   workers/sync-worker (BullMQ)
```

Servicios locales en Docker Compose (proyecto `appinity-claude`). Docker Compose es una propuesta de
desarrollo, no el hosting final.

## Monorepo

pnpm workspaces (`nodeLinker: hoisted`), TypeScript 6.0 con project references (`tsc -b`), ESM en todos los
paquetes Node. La app móvil la empaqueta Metro (Expo SDK 57) y consume `@appinity/shared` e `@appinity/i18n`
compilados.

| Paquete | Responsabilidad | Depende de |
|---|---|---|
| `@appinity/shared` | Categorías, contratos (`NormalizedObservation`, `ProfileSourceAdapter`, `CatalogProvider`, `CatalogItem`), DTOs de API, esquemas Zod de validación runtime, nombres de colas | zod |
| `@appinity/i18n` | Textos es/en con las mismas claves (comprobado por test) | — |
| `@appinity/algorithms` | Reglas puras y versionadas (normalización de escalas, consolidación; afinidad en fase 5). Prohibido importar proveedores, BD o colas (regla ESLint) | shared |
| `@appinity/database` | Esquema Drizzle, migraciones SQL versionadas, cliente pg, reset/migrate | shared, algorithms |
| `@appinity/catalog` | Proveedores de catálogo, resolución de entidades, imágenes (fase 1) | shared, database |
| `@appinity/integrations` | Adapters `profile/<fuente>` y registro por clave (fase 1) | shared, algorithms |
| `@appinity/ingestion` | Pipeline de sync y seed de demo | todos los anteriores |
| `@appinity/api` | API HTTP | shared, database, catalog, integrations |
| `@appinity/sync-worker` | Worker BullMQ | shared, database, catalog, integrations, ingestion |
| `@appinity/mobile` | App Expo | shared, i18n |

## API (fase 0)

| Ruta | Acceso | Descripción |
|---|---|---|
| `GET /health` | Pública | BD, PostGIS, Redis y latido del worker. 200 si BD/PostGIS/Redis responden, 503 si no |
| `GET /v1/dev/users` | Pública solo con identidad de desarrollo | Lista usuarios `dataset = demo`. 404 si está desactivada |
| `POST /v1/dev/session` | Pública solo con identidad de desarrollo, limitada (20/min) | Emite JWT HS256 (12 h) para un usuario de demo |
| `GET /v1/me` | Sesión | Usuario, perfil mínimo y ajustes propios |
| `PATCH /v1/me/settings` | Sesión | Idioma, zona horaria, radio 1–50 km, zona aproximada, descubrimiento por contactos, frecuencia de notificaciones (validación Zod estricta) |

Autorización:

- `AuthGuard` global: toda ruta sin `@Public()` exige `Authorization: Bearer <token>`, verifica firma,
  emisor, audiencia y caducidad, y que el usuario siga activo y sea de `dataset = demo`.
- El `userId` sale siempre de la sesión. Las rutas `/v1/me/*` no aceptan identificadores de otros usuarios.
- `ThrottlerGuard` global (300 peticiones/min por IP) y límite específico en la emisión de sesiones.
- `helmet`, cuerpo JSON máximo de 100 kB, sin `x-powered-by`.
- La configuración se valida al arrancar (Zod). Con `NODE_ENV=production` no puede activarse `DEMO_MODE` ni
  la identidad de desarrollo.

## Base de datos (fase 0)

Migraciones en `packages/database/drizzle/` (SQL versionado generado por drizzle-kit y revisado):

- `0000_enable_postgis`: extensiones `postgis` y `pgcrypto`.
- `0001_identity`: `users`, `user_profiles`, `user_settings`.

`users.dataset` separa los usuarios simulados (`demo`) de los reales (`live`). `user_settings` guarda una zona
aproximada (latitud/longitud redondeadas a 2 decimales, origen `manual` o `device`) y una columna generada
`geography(Point,4326)` con índice GiST para distancias en metros (`ST_DWithin`). Las constraints validan radio
1–50, idioma, coherencia de la ubicación y frecuencia de notificaciones.

## App móvil (fase 0)

- Expo Router con `(tabs)`: Inicio, Categorías, Personas, Perfil, más la pantalla `dev-login`.
- `SessionGate` redirige a `dev-login` sin sesión. El token se guarda con `expo-secure-store`.
- URL de la API: `EXPO_PUBLIC_API_URL`, si no la IP de Metro + `:3100`, y solo como último recurso `localhost`.
  Visible en Perfil → Diagnóstico.
- i18next con recursos de `@appinity/i18n`. El idioma inicial es el del sistema y después manda el ajuste
  `locale` del usuario.
- Reanimated (animación de entrada en Inicio) y Gesture Handler (`GestureHandlerRootView`) activos y compatibles
  con Expo Go.

## Worker (fase 0)

`workers/sync-worker` conecta a Redis (`maxRetriesPerRequest: null`, prefijo `appinity-claude`), atiende la
cola `system` y escribe un latido cada 10 s que `/health` muestra. Las colas `profile-sync` y `catalog-images`
llegan en la fase 1.

## Pendiente por fase

Ver [progress.md](progress.md). Catálogo, observaciones y consolidación (fase 1); adapters reales (2–4, 11);
afinidad, Top 50 y recomendador (5–7); Home, Categories y People completos (8–10); chat, Premium y push (12);
autenticación de producción y beta (13).

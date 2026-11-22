# APPINITY · implementación Claude

> Descubre recomendaciones de tus almas gemelas y conoce a las personas que comparten tus gustos.

Implementación independiente de APPINITY construida desde cero a partir de
[docs/APPINITY_Especificacion.md](docs/APPINITY_Especificacion.md). No reutiliza código de otras implementaciones.

**Estado:** fase 0 (monorepo, servicios, API, auth de desarrollo, app con cuatro pestañas, i18n).
Detalle en [docs/progress.md](docs/progress.md). Todavía **no** hay recomendador, afinidades ni conexiones reales.

| Qué | Estado |
|---|---|
| Usuarios de la demo | **Simulados** (`dataset = demo`, nombres con «(demo)») |
| Identidad | **De desarrollo** (JWT firmado por la API con `DEMO_MODE`). No es la autenticación de producción |
| Fuentes externas (Steam, TMDb, Last.fm…) | **Pendientes** (fases 2–4 y 11) |
| Recomendaciones y afinidad | **Pendientes** (fases 5–8). La app no muestra ninguna inventada |

## Requisitos

Comprobado en Windows 11 con:

- Node.js 24 (probado 24.21.0) y pnpm 11 (probado 11.19.0; `corepack enable` o `npm i -g pnpm@11`)
- Docker Desktop con Docker Compose v2 (probado Docker 29.8, Compose 5.5)
- Git
- Teléfono con **Expo Go** actualizado (SDK 57) en la misma red que el PC

## Puesta en marcha (PC)

Desde la carpeta del repositorio:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm setup
```

Crea `.env` con secretos aleatorios (no se sube a Git) y `apps/mobile/.env` con la URL de la API
vista desde el teléfono (por ejemplo `http://192.168.1.16:3100`). Si detecta otra IP, fuerza la tuya:
`pnpm setup --ip 192.168.1.16`.

```bash
pnpm services:up
```

Levanta PostgreSQL 17 + PostGIS 3.5 (`127.0.0.1:5442`) y Redis 7.4 (`127.0.0.1:6390`) en el proyecto
Docker `appinity-claude`, con volúmenes propios (`appinity_claude_pg`, `appinity_claude_redis`).
Resultado esperado: `Container appinity-claude-postgres Healthy` y `Container appinity-claude-redis Healthy`.

```bash
pnpm db:migrate
```

Resultado esperado: `✔ Migraciones aplicadas (… ms) en appinity_claude`. Puede repetirse: es idempotente.

```bash
pnpm db:seed
```

Resultado esperado: `✔ Usuarios simulados: 6 (dataset demo)`. Repetirlo deja exactamente el mismo estado
(restablece también los ajustes de los usuarios de demo).

Arranca API y worker (cada uno en su terminal, o juntos con `pnpm dev`):

```bash
pnpm api
```

```bash
pnpm worker
```

Comprueba:

```bash
pnpm doctor
```

Resultado esperado: servicios `healthy`, `http://127.0.0.1:3100/health → ok` y la IP de tu red
(`192.168.1.16`) marcada como «API accesible».

## Probar en el teléfono (Expo Go)

1. Instala **Expo Go** desde Google Play (Android) o App Store (iPhone) y actualízalo: el proyecto usa
   Expo SDK 57. Todas las dependencias nativas (Reanimated, Gesture Handler, SecureStore, Location, Image)
   están incluidas en Expo Go, así que **no hace falta un development build**.
2. Teléfono y PC en la misma red. Un PC por Ethernet y un móvil por Wi-Fi conectados al mismo router sirven,
   salvo que el router aísle clientes o el móvil esté en una red de invitados.
3. Antes de abrir la app, abre en el **navegador del teléfono** `http://192.168.1.16:3100/health`
   (usa tu IP). Debe mostrar un JSON con `"status":"ok"`. Si no carga, revisa el apartado de red.
4. Arranca Metro:

   ```bash
   pnpm mobile
   ```

   Usa el puerto 8091 (no el 8081 por defecto, para no chocar con otros proyectos).
5. Escanea el QR con Expo Go (Android) o con la cámara (iPhone). Si el QR no aparece en la terminal,
   en Expo Go escribe la URL manual `exp://192.168.1.16:8091`.
6. Recorrido esperado:
   - Pantalla **Elige un usuario de demo** con seis usuarios simulados y el aviso «DEMO · actividad de
     usuarios simulada». Abajo, la tarjeta **Conexión con la API** debe indicar «Conectada».
   - Al elegir un usuario, aparecen las cuatro pestañas **Inicio, Categorías, Personas, Perfil**.
   - **Inicio** explica que el carrusel aún no existe (no hay recomendaciones inventadas).
   - **Categorías** muestra las ocho categorías con icono, color y alcance (local o global).
   - **Personas** indica que almas gemelas y amigos están pendientes (sin porcentajes).
   - **Perfil**: identidad de desarrollo, idioma (Español/English cambia toda la interfaz), zona
     (manual o «Usar mi ubicación aproximada (una vez)»), radio 1–50 km, «Permitir que mis contactos me
     encuentren», frecuencia de notificaciones y el diagnóstico de conexión.
   - «Cambiar de usuario de demo» vuelve a la pantalla inicial.

### Si el teléfono no alcanza la API

- `localhost` en el teléfono es el propio teléfono: la URL debe usar la IP del PC (`pnpm setup` la escribe
  en `apps/mobile/.env`; tras cambiarla, reinicia Metro con `pnpm --filter @appinity/mobile start:clear`).
- Si `apps/mobile/.env` no existe, la app usa la IP de Metro con el puerto 3100 (se ve en Perfil → Diagnóstico).
- Firewall de Windows: en este PC ya existe una regla de entrada «Node.js JavaScript Runtime» que permite
  `node.exe` en el perfil **Público**, que es el que tiene la red Ethernet. Si Windows vuelve a preguntar,
  permite el acceso. Si sigue sin funcionar, crea como administrador una regla de entrada TCP para los puertos
  3100 y 8091 limitada a tu red. Esta implementación no cambia la configuración del sistema.
- `pnpm doctor` comprueba servicios, API local y API por cada IP de red.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm setup` | Crea `.env` y `apps/mobile/.env` (secretos aleatorios e IP de red) |
| `pnpm services:up` / `services:down` | Arranca o para PostgreSQL+PostGIS y Redis (Docker) |
| `pnpm build` | Compila todos los paquetes TypeScript (`tsc -b`) |
| `pnpm db:migrate` | Aplica migraciones versionadas (Drizzle) |
| `pnpm db:seed` | Seed determinista de la demo (solo `DEMO_MODE=true`, nunca en producción) |
| `pnpm db:reset` | Vacía la BD de desarrollo, migra y siembra (solo `DEMO_MODE=true`) |
| `pnpm api` / `pnpm worker` | API NestJS en `0.0.0.0:3100` / worker BullMQ |
| `pnpm dev` | Compilación en modo watch + API + worker |
| `pnpm mobile` | Metro/Expo en el puerto 8091 |
| `pnpm doctor` | Diagnóstico de servicios y red |
| `pnpm lint` | ESLint (incluye la regla que impide importar proveedores en `packages/algorithms`) |
| `pnpm typecheck` | `tsc` de paquetes, tests y app móvil |
| `pnpm test` | Compila y ejecuta tests unitarios e integración (requiere `pnpm services:up`) |

Los tests de integración usan la base de datos `appinity_claude_test` (creada por el contenedor) y la vacían
en cada ejecución. Nunca tocan `appinity_claude`.

## Estructura

```text
apps/api            API NestJS (health, identidad de desarrollo, /v1/me)
apps/mobile         Expo SDK 57 + Expo Router (cuatro pestañas), TanStack Query, Zustand, i18next
packages/shared     Categorías, contratos (observaciones, adapters, catálogo) y DTOs, con validación Zod
packages/i18n       Textos es/en fuera del código
packages/database   Esquema Drizzle, migraciones SQL, cliente PostgreSQL/PostGIS
packages/ingestion  Seed de demo (y, en fase 1, el pipeline de sync)
packages/algorithms, catalog, integrations   Estructura creada; contenido en la fase 1
workers/sync-worker Worker BullMQ (en fase 0: latido y cola system)
docs/               Especificación, arquitectura, decisiones, progreso, capacidades de integración
```

Más detalle en [docs/architecture.md](docs/architecture.md) y [docs/decisions.md](docs/decisions.md).

## Seguridad y datos

- Secretos solo en `.env` (ignorado por Git). `pnpm setup` los genera aleatoriamente.
- Servicios Docker solo en `127.0.0.1`. La API escucha en `0.0.0.0:3100` para el teléfono de la red local.
- Todas las rutas salvo `/health` y la identidad de desarrollo exigen sesión. El usuario sale del token,
  nunca de la URL.
- La identidad de desarrollo solo funciona con `DEMO_MODE=true` y fuera de producción, y solo con usuarios
  `dataset = demo`. La API se niega a arrancar con `NODE_ENV=production` y `DEMO_MODE` activo.
- La ubicación se guarda como zona aproximada (coordenadas redondeadas a ~1 km), sin historial.

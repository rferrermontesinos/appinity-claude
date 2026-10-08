# APPINITY · implementación independiente

Lee docs/APPINITY_Especificacion.md, docs/APPINITY_Prompt_Claude_Desde_Cero.md, docs/decisions.md y docs/progress.md antes de trabajar.

Este repositorio parte de cero. No leer, importar, copiar, ejecutar ni modificar el código de APPINITY desarrollado con Codex. Se comparten requisitos de producto para poder comparar los resultados. El remoto esperado es appinity-claude; compruébalo antes del primer push. Aísla base de datos, volúmenes, Redis y configuración respecto de otras implementaciones locales.

## Reglas de producto

- Concepto: Descubre recomendaciones de tus almas gemelas y conoce a las personas que comparten tus gustos.
- Ocho categorías y cuatro pestañas. Música recomienda artistas; podcasts recomienda programas.
- Los gustos proceden exclusivamente de fuentes externas consentidas. Swipes, Keep, Undo, enlaces, amistad y chat nunca cambian preferencias.
- Known, Consumed y Preference son independientes. NULL expresa falta de evidencia, no rechazo.
- Catálogo canónico con IDs externos e imagen persistente o referencia y fallback.
- Adapters de perfil separados de proveedores de catálogo. Sin dependencias de proveedores en el motor.
- Afinidad calculada, direccional y versionada; nunca porcentajes constantes disfrazados de cálculos.
- Consenso solo Top 50, igual peso por persona. Mezcla objetivo 70/20/10 cuando existan candidatos.
- Trending: ratings explícitos externos de usuarios de la zona, sin peso de afinidad; año actual dinámico y reglas temporales de la especificación.
- Distinguir en UI y docs datos reales, fixtures y funcionalidades pendientes.
- No exponer tokens ni historiales ajenos. Secretos fuera de Git. Autorización por recurso en backend.

## Trabajo por entregas

Primera entrega: fases 0 y 1. Ejecutar comprobaciones y preparar instrucciones de prueba; no avanzar a Steam hasta la aceptación manual de la demo. Si falta un permiso o secreto, completar lo independiente y declarar el bloqueo específico. No marcar una integración real como validada solo por sus fixtures.

Actualizar README.md, docs/progress.md y docs/decisions.md con cada entrega. Crear docs/architecture.md y docs/integration-capabilities.md cuando corresponda. Anotar comandos reales, resultados, limitaciones y siguiente paso. No declarar tests ejecutados sin ejecutarlos. Un test de interfaz web no sustituye la aceptación en dispositivo.

Tienes autorización para crear commits, subir los archivos nuevos y cambios a appinity-claude y actualizar su documentación. Usar una rama por fase y pull request cuando esté disponible; no force push ni merge automático. No subir secretos, datos personales ni la base de datos. Indicar commit, rama y enlace de PR o el impedimento concreto si falla el push. No contratar servicios, desplegar públicamente ni publicar en tiendas sin una tarea específica.

## Entorno y comandos comprobados

Windows 11, Node 24, pnpm 11, Docker Compose. Puertos propios: PostgreSQL 5442, Redis 6390, API 3100, Metro 8091
(proyecto Docker `appinity-claude`). En este PC hay otra implementación con 3000, 5433, 6379 y 8081: no tocarla,
y detener procesos solo si su línea de comandos contiene `APPINITY CLAUDE`.

- `pnpm install --frozen-lockfile` · `pnpm setup` (crea `.env` y `apps/mobile/.env`)
- `pnpm services:up` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:reset`
- `pnpm api` · `pnpm worker` · `pnpm dev` · `pnpm mobile` (Expo en 8091) · `pnpm doctor`
- `pnpm lint` · `pnpm typecheck` · `pnpm test` (requiere servicios; usa la BD `appinity_claude_test`)
- Tras cambiar `packages/database/src/schema`: `pnpm db:generate` y revisar el SQL generado.
- Los tests de la API importan `apps/api/dist` (ejecutar `pnpm build` antes; `pnpm test` ya lo hace).
- `pnpm --filter @appinity/mobile web` (puerto 8092): vista web solo para verificar pantallas; no sustituye al teléfono.
- `pnpm fixtures:catalog`: regenera la instantánea de Wikidata/Commons (red; cambia la demo, revisar el diff).
- Expo Go del SDK 57. En iPhone exige iniciar sesión en Expo Go y en la CLI. El emulador Android local tiene Expo Go 55 de
  otra implementación: no actualizarlo sin permiso.

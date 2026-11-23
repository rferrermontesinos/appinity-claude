# APPINITY · implementación independiente

Lee docs/APPINITY_Especificacion.md, docs/APPINITY_Prompt_Claude_Desde_Cero.md, docs/decisions.md y docs/progress.md antes de trabajar.

Este repositorio parte de cero. No leer, importar, copiar, ejecutar ni modificar el código de APPINITY desarrollado con Codex. Se comparten requisitos de producto para poder comparar los resultados. El remoto esperado es appinity-claude; compruébalo antes del primer push. Aísla base de datos, volúmenes, Redis y configuración respecto de otras implementaciones locales.

## Reglas de producto

- Concepto: Descubre recomendaciones de tus almas gemelas y conoce a las personas que comparten tus gustos.
- Ocho categorías y cuatro pestañas. Música recomienda artistas; podcasts recomienda programas.
- Los gustos proceden de fuentes externas consentidas y de los **votos explícitos en la app** (fuente declarada `appinity`, mismo peso que una nota externa; decisión del titular, 2026-10-27). Votos: No me gusta −0,5, Me gusta +0,5, Me encanta +1. «No lo conozco», deshacer (salvo deshacer un voto), enlaces, amistad y chat nunca cambian preferencias. Guardar ya no existe (motor v3).
- El perfil de gustos se alimenta de forma continua, «con tendencia a infinito» (decisión del titular, 2026-11-22): hay
  pocos datos de partida y la app sirve para construir un perfil completo y complejo. Toda señal explícita de gusto en
  la app cuenta; una señal nueva se añade como fuente declarada y documentada, nunca a escondidas.
- **Consentimiento único** (2026-11-22): el alta es el único momento de consentimiento y cubre todas las fuentes, las de
  ahora y las que se añadan (una fuente nueva entra en ese mismo consentimiento; no se vuelve a pedir). Cada proveedor
  puede mostrar su propia pantalla de permiso al conectarlo, pero APPINITY no añade otra. Las opciones de privacidad
  («Lo que os une», que te encuentren por tus contactos) se eligen en el alta, apagadas por defecto, y se cambian en
  Ajustes.
- Known, Consumed y Preference son independientes. NULL expresa falta de evidencia, no rechazo.
- Catálogo canónico con IDs externos e imagen persistente o referencia y fallback.
- Adapters de perfil separados de proveedores de catálogo. Sin dependencias de proveedores en el motor.
- Afinidad calculada, **simétrica** (la misma cifra en los dos sentidos: «sois almas gemelas al 87 %»; decisión del
  titular, 2026-11-22) y versionada; nunca porcentajes constantes disfrazados de cálculos.
- El ranking de personas y la afinidad solo leen gustos: nunca fotos, galería, edad, género u origen, popularidad, tiempo
  mirando ni mensajes (pantalla «Cómo funciona APPINITY» y test de garantía). Coincidir en lo poco común pesa más
  (`affinity-v5`). De otra persona solo se muestran hasta 5 obras que os gustan a los dos («Lo que os une», recíproco,
  opcional y solo con quien aparece como alma gemela o es tu amistad); nunca su historial.
- Consenso solo Top 50, igual peso por persona. Mezcla objetivo **70/20/10** cuando existan candidatos: 70 consenso, 20
  descubrimiento (incluye la tarjeta de personas que sigues) y 10 Trending. Pasará a 70/10/10/10 cuando haya eventos o
  productos patrocinados, con ese cuarto bloque (decisión del titular, 2026-11-22).
- Trending: ratings explícitos de usuarios de la zona, **externos y votos en APPINITY** (2026-11-22), sin peso de afinidad; año actual dinámico y reglas temporales de la especificación.
- Votación con el estilo «Cuatro direcciones» (2026-11-22): ← No me gusta, → Me gusta, ↑ Me encanta, ↓ No lo conozco,
  con los bordes rotulados y botones de respaldo en el mismo orden.
- Distinguir en UI y docs datos reales, fixtures y funcionalidades pendientes.
- No exponer tokens ni historiales ajenos. Secretos fuera de Git. Autorización por recurso en backend.

## Trabajo por entregas

**Alcance congelado hasta la beta cerrada** (decisión del titular, 2026-11-22): solo bloqueantes de la beta, seguridad,
privacidad y errores. Funciones nuevas, después de la beta. Base de trabajo: `main` (todas las fases fusionadas el
2026-11-22); cada cambio en su rama y PR contra `main`.

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
- `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` (requiere servicios; usa la BD `appinity_claude_test`)
- Tras cambiar `packages/database/src/schema`: `pnpm db:generate` y revisar el SQL generado.
- Los tests de la API importan `apps/api/dist` (ejecutar `pnpm build` antes; `pnpm test` ya lo hace).
- `pnpm --filter @appinity/mobile web` (puerto 8092): vista web solo para verificar pantallas; no sustituye al teléfono.
- `pnpm fixtures:catalog`: regenera la instantánea de Wikidata/Commons (red; cambia la demo, revisar el diff).
- `pnpm user:local --handle h --name "N"`: cuenta local real (dataset live) con código de un solo uso.
- `pnpm account:export|account:delete --email x`: peticiones de derechos por email (copia en `exports/`; la baja exige
  `--confirm <handle>`). Ver docs/operations.md.
- `pnpm feedback:list [--all] [--mark-read]`: comentarios de los testers de la beta (Perfil → Enviar comentario).
- `pnpm push:test --handle h`: notificación de prueba al teléfono (push con EAS_PROJECT_ID y google-services.json; no en
  Expo Go).
- `pnpm secret:set STEAM_WEB_API_KEY`: guarda la clave de Steam en .env sin mostrarla (el usuario, en su terminal).
- `pnpm secret:set GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET --clipboard`: cliente OAuth de Google. En
  desarrollo Google solo vuelve a `localhost`: el usuario conecta Google desde la vista web del PC (8092) y el permiso
  dura 7 días (modo Testing). Antes de implementar cualquier fuente, comprobar sus condiciones de uso comercial.
- Si el usuario tiene `pnpm api`/`pnpm worker` en marcha, no detenerlos: pedirle que los reinicie tras un build.
- Expo Go del SDK 57. En iPhone exige iniciar sesión en Expo Go y en la CLI. El emulador Android local tiene Expo Go 55 de
  otra implementación: no actualizarlo sin permiso.

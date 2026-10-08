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

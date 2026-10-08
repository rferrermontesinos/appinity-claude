# APPINITY · prompt maestro para Claude desde cero

Construye APPINITY desde cero en este repositorio independiente, appinity-claude. Existe otra implementación realizada con Codex que compararé más adelante. No la consultes ni reutilices su código, estructura concreta, tests o documentación de progreso. Tu punto de partida son los requisitos de producto adjuntos, no una aplicación existente.

Lee CLAUDE.md y docs/APPINITY_Especificacion.md completos, además de docs/decisions.md y docs/progress.md. Inspecciona esta carpeta y verifica que el remoto corresponda al nuevo proyecto. Si solo hay documentos iniciales, esa es la situación esperada: debes crear la aplicación. No copies archivos de otro repositorio ni borres su contenido.

## Objetivo e invariantes

Concepto: «Descubre recomendaciones de tus almas gemelas y conoce a las personas que comparten tus gustos».

App móvil con Home, Categories, People y Profile; ocho categorías: restaurantes, películas, series, artistas musicales, videojuegos, libros, cultura y programas de podcasts. Catálogo canónico con imagen principal persistente o referencia, metadatos, IDs de proveedores y fallback de imagen.

Solo fuentes externas consentidas generan gustos. Known, Consumed y Preference son campos independientes. Una watchlist o un juego comprado con cero horas no generan preferencia. Los ratings explícitos prevalecen según la consolidación especificada. Swipes, Keep, Undo, enlaces y amistad no cambian gustos.

Separa ProfileSourceAdapter y CatalogProvider. NormalizedObservation debe conservar procedencia, sourceRecordId, observationKind, fechas reales y mapperVersion. Persistencia y sync idempotentes; múltiples fuentes del mismo objeto no multiplican personas ni votos. Los algoritmos trabajan sobre datos normalizados, sin importar SDKs de proveedores.

Afinidad determinista, direccional, explicable y versionada; NULL cuando falte evidencia, 0 posible cuando exista desacuerdo suficiente. No hardcodear porcentajes. Top 50 gratuito; perfil público mínimo sin historial importado.

Recomendador con objetivo 70 % consenso Top 50 con igual peso por persona, 20 % descubrimiento individual con origen verificable y 10 % Trending. Trending usa ratings explícitos de usuarios de la misma zona, independientemente de afinidad, con votos únicos, mínimos y reglas del año actual. No usar fecha de sincronización como fecha de voto; no recomendar estrenos antiguos como Trending. Respetar la interpretación propuesta para entidades permanentes y documentarla. Fallbacks con etiquetas veraces.

Home conserva descartes por usuario y objeto. Keep no crea una lista manual. Undo revierte la última acción. NEW es primera impresión, no estreno. Categories puede mostrar descartes de Home. Restaurante y cultura respetan radio; los objetos globales no se restringen a catálogo local.

Social, Premium, chat, push y autenticación de producción se construirán en sus fases. Autorización por recurso y protección de credenciales son obligatorias desde la base. DEMO_MODE está identificado y separado de producción.

## Stack para facilitar la comparación

Monorepo TypeScript con pnpm workspaces; apps/mobile con React Native, Expo, Expo Router, TanStack Query, Zustand, Reanimated, Gesture Handler e i18next; apps/api con NestJS; PostgreSQL con PostGIS y Drizzle; Redis y BullMQ. Paquetes separados database, shared, algorithms, integrations, catalog e i18n; workers de sync, afinidad y recomendaciones según las fases.

Verifica versiones compatibles en documentación oficial y fija lockfile. Usa servicios locales reproducibles, por ejemplo Docker Compose. Mantén configuración, nombres de proyecto, volúmenes y datos separados de otras instalaciones. Documenta puertos libres y URL de API para dispositivo físico. No elegir todavía el hosting final. No introducir servicios de pago para hacer funcionar la primera demo.

## Primera tarea: solo fases 0 y 1

1. Resume el alcance y las decisiones necesarias; después implementa. No te detengas en un plan.
2. Fase 0: crea monorepo, scripts de instalación y arranque, configuración de servicios, migraciones, health check, API privada con identidad de desarrollo claramente delimitada, navegación de cuatro pestañas e internacionalización básica. No simular autenticación de producción.
3. Fase 1: implementa entidades de catálogo con imagen, IDs canónicos, observaciones normalizadas, conexiones, perfiles consolidados, validación runtime e idempotencia. Construye un adapter fixture con el contrato que usarán las fuentes reales.
4. Prepara datos deterministas identificados como simulados para las ocho categorías: conocido sin consumo, consumo sin rating, rating positivo y negativo, watchlist, juego con cero horas, objetos duplicados entre fuentes y fechas ausentes. Añade una vista de demo que permita verificar el modelo y las imágenes, sin presentar un recomendador ni afinidades falsos como reales.
5. Prueba los contratos y las reglas críticas; comprueba instalación con lockfile, migración y seed repetibles, interacción API/BD/Redis, lint, TypeScript y compilación/bundles móviles pertinentes. Registra lo ejecutado, lo que falla y lo no disponible en este entorno.
6. Entrega README.md con pasos exactos para levantar la demo y verla en un teléfono: URL de API alcanzable, comandos, resultados esperados y diagnóstico de red. Usa Expo Go si es compatible; si una dependencia requiere un development build, explica cómo generarlo y por qué.
7. Actualiza CLAUDE.md con comandos comprobados, docs/architecture.md, docs/decisions.md, docs/integration-capabilities.md y docs/progress.md. Incluye aceptación manual pendiente y límites reales de esta entrega.
8. Guarda la entrega en GitHub: tienes autorización para subir cambios y actualizar documentación en appinity-claude. Usa rama por fase y PR si puedes; no force push ni merge automático. Si falta autenticación, explica cómo completarla y no afirmes que el código está subido.

Termina indicando qué funciona, cómo lo pruebo, qué se verificó automáticamente, qué está simulado, qué falta y el commit/PR. Detente antes de la fase 2 hasta que confirme haber probado la demo. No declarar terminada la aplicación por una pantalla atractiva o porque compile.

## Continuidad

Seguir las fases 2–13 de la especificación, una tarea acotada por fase o subfase. Leer siempre progreso y decisiones; no recrear trabajo validado. Para Steam, TMDb y Last.fm verificar documentación oficial y dar instrucciones de credenciales seguras. Probar mi cuenta real cuando aporte permisos, junto con perfiles sintéticos variados; no importar datos privados de terceros ni fabricar datos y etiquetarlos como reales.

Los parámetros propuestos siguen pendientes de calibración. Registrar valores, justificación y casos usados. No cambiar requisitos para completar cuotas, producir afinidades altas o desbloquear APIs inexistentes. Si una fuente no permite una función, registrar la limitación y dejarla desactivada.

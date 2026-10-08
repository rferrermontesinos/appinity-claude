# APPINITY · construir desde cero con Claude Pro

Paquete preparado el 8 de octubre de 2026. Objetivo: obtener una segunda implementación independiente para compararla después con Codex. Se comparten los requisitos de APPINITY, no su código ni el progreso de la otra implementación.

## 1. Elegir dónde trabajar

Recomiendo Claude Desktop → Code → Local para desarrollar y probar la app móvil en tu ordenador. Instala Claude Desktop e inicia sesión con tu cuenta Pro. Selecciona la carpeta del nuevo proyecto en Code. La aplicación incluye Claude Code; no necesitas instalar su CLI para esta vía. Para ejecutar APPINITY sí necesitarás las herramientas del proyecto. [1]

Claude Pro incluye Claude Code, con límites compartidos con el uso de Claude. Usa tu cuenta Pro; no necesitas una API key de Anthropic. Si alcanzas el límite, puedes esperar al reinicio; los créditos extra/API son opcionales y pueden generar cargos aparte. Trabaja por fases y conserva el progreso en Git. [2]

Alternativa desde navegador: entra en https://claude.ai/code, conecta GitHub autorizando la Claude GitHub App para el repositorio nuevo, selecciona el proyecto y configura su entorno. El trabajo cloud también está disponible en Pro. Clona después el resultado a tu ordenador para las pruebas móviles. Un entorno de desarrollo cloud no equivale al hosting de APPINITY. [3]

## 2. Crear el proyecto independiente

1. En GitHub crea un repositorio privado llamado appinity-claude. Puede incluir un README inicial. No hagas un fork de la versión de Codex.
2. Clónalo a una carpeta nueva con GitHub Desktop o Git. No abras la carpeta de appinity desarrollada por Codex.
3. Descarga APPINITY_Claude_Desde_Cero.zip y extrae su contenido dentro del nuevo repositorio: CLAUDE.md debe quedar en la raíz, junto a docs/, prompts/ y comparacion/.
4. Guarda estos documentos iniciales con un commit y súbelos al repositorio. Si usas cloud, deben estar en GitHub antes de iniciar la sesión.
5. En Claude Desktop abre Code → Local y selecciona esa carpeta nueva.

No adjuntes el código, AGENTS.md ni docs/progress.md de Codex. El paquete ya incluye progreso inicial vacío y requisitos adaptados. Aísla también las bases de datos y volúmenes: las dos aplicaciones no deben escribir sobre los mismos datos.

## 3. Herramientas y conexiones

No hace falta un plugin o servidor MCP adicional para construir la base en local. Claude Code accede al proyecto y ejecuta herramientas; para subir cambios necesitas Git autenticado con GitHub. Puedes resolver ese acceso con GitHub Desktop o el mecanismo Git que utilices. En cloud necesitas autorizar la conexión GitHub de Claude.

Para ejecutar el proyecto se usarán Node.js, pnpm, Git y servicios PostgreSQL/PostGIS y Redis. Docker Compose es la opción local propuesta para los servicios. Pide a Claude que verifique primero qué tienes instalado y te dé los pasos exactos para tu sistema. Un fallo por una herramienta ausente no significa que debas contratar hosting.

Para el teléfono: Expo Go si las dependencias son compatibles, o un development build cuando haga falta. El ordenador y el teléfono necesitan una API alcanzable; localhost del móvil no apunta al ordenador. Claude debe documentar la URL y los pasos reales según tu entorno. [4]

Steam, TMDb, Last.fm y los demás proveedores se conectarán en sus fases. No son plugins de Claude: son integraciones de APPINITY. Crea las credenciales cuando toque y guárdalas en configuración local ignorada por Git o en secretos del entorno; no las pegues en prompts. La base de datos vive en tu ordenador o en un servicio de hosting posterior, no dentro de GitHub.

## 4. Archivos de partida y primer prompt

En Code Local basta con tener los archivos dentro de la carpeta. Puedes referenciarlos con @ o escribir sus rutas; no hay que volver a adjuntar el ZIP en cada tarea.

| Archivo | Para qué sirve |
|---|---|
| CLAUDE.md | Instrucciones persistentes del repositorio |
| docs/APPINITY_Especificacion.md | Requisitos completos, ocho categorías, modelo, fórmulas y aceptación |
| docs/APPINITY_Prompt_Claude_Desde_Cero.md | Encargo maestro; primera entrega 0–1 |
| docs/decisions.md | Decisiones y propuestas pendientes |
| docs/progress.md | Progreso nuevo, inicialmente todo pendiente |
| prompts/ | Texto para copiar en cada fase o revisión |
| comparacion/CASOS_Y_CRITERIOS.md | Pruebas comunes y evaluación posterior |

Primer mensaje, disponible también en prompts/00_empezar_desde_cero.md:

> Quiero que construyas APPINITY desde cero en este repositorio nuevo, appinity-claude, para compararlo después con otra implementación. No consultes ni reutilices el código de Codex. Lee CLAUDE.md, docs/APPINITY_Especificacion.md y docs/APPINITY_Prompt_Claude_Desde_Cero.md. Ejecuta el prompt maestro: en esta entrega solo fases 0 y 1. Actualiza documentación y guarda los cambios en GitHub. Al terminar, dame instrucciones exactas para probar la demo en mi teléfono y no avances a Steam hasta que la haya probado.

No uses únicamente el chat general de Claude para generar fragmentos: realiza estas tareas dentro de Claude Code, con acceso a la carpeta o repositorio. Revisa el modo de permisos; un modo de planificación puede preparar un plan, pero la entrega exige ejecutar e implementar.

## 5. Probar la primera entrega antes de continuar

Envía prompts/01_probar_demo.md. Claude debe repetir sus instrucciones de instalación, corregir errores y guiarte para:

1. Instalar dependencias y levantar BD/Redis.
2. Ejecutar migraciones y seed; repetirlos sin duplicados.
3. Arrancar la API y comprobar health y protección de rutas privadas.
4. Abrir la app en teléfono y recorrer cuatro pestañas.
5. Ver imágenes, fallback y datos claramente identificados como simulados.
6. Verificar que conocido, consumido y preferencia no se confunden.

Todavía no hay conexiones reales ni motor final de recomendación. En esta fase se acepta una demo honesta de la base, no se declara terminada la aplicación. Si algo falla, describe el error y pide corregir esa entrega. Cuando lo hayas comprobado, escribe: «He probado la demo y funciona. Continúa con la fase 2 usando prompts/fase_02_steam.md».

## 6. Fases y prompts

Usa una nueva tarea por fase o bloque acotado. Abre el archivo indicado y copia su contenido en Claude Code. Los prompts completos están en el ZIP; no necesitas volver a pegar el documento maestro.

| Fase | Entrega | Archivo del prompt | Comprobación principal |
|---|---|---|---|
| 0 | Monorepo, API, Expo y servicios | fase_00_esqueleto.md | Instalar y arrancar de forma reproducible |
| 1 | Modelo, imágenes, consolidación y fixtures | fase_01_modelo_y_fixtures.md | Reglas de datos correctas y demo en teléfono |
| Puerta de validación | Aceptar la demo antes de Steam | 01_probar_demo.md | Prueba manual; no basta con tests |
| 2 | Steam | fase_02_steam.md | Tu cuenta: conectar, sync, repetir, desconectar |
| 3 | TMDb | fase_03_tmdb.md | Ratings disponibles; sin inventar vistos |
| 4 | Last.fm | fase_04_lastfm.md | Agregación por artista e idempotencia |
| 5 | Afinidad | fase_05_afinidades.md | NULL, desacuerdo, confianza y direccionalidad |
| 6 | Top 50 | fase_06_top50.md | Ranking real, estable y bloqueos |
| 7 | Recomendador y Trending | fase_07_recomendador_trending.md | 70/20/10, evidencia, zona y año actual |
| 8 | Home | fase_08_home.md | Gestos, botones, Undo, NEW y persistencia |
| 9 | Categories | fase_09_categories.md | Ocho categorías y cold start |
| 10 | People y Friends | fase_10_people_friends.md | Solicitudes, privacidad y bloqueo |
| 11 | Fuentes adicionales | fase_11_adapters_restantes.md | Una fuente por tarea; viabilidad verificada |
| 12A | Chat | fase_12A_chat.md | Permisos y solicitud/aceptación |
| 12B | Premium | fase_12B_premium.md | Entitlements verificados y sandbox |
| 12C | Notificaciones | fase_12C_push.md | Frecuencias y envío real en dispositivo |
| 13 | Beta | fase_13_beta.md | Auth real, flujo completo y builds comprobados |

Los nombres de la tabla están dentro de prompts/. El maestro ejecuta 0–1 juntos; los prompts separados sirven para retomar entregas parciales. Para la fase 11 usar una tarea por proveedor, no una tarea enorme para todos. No declarar 12 completa hasta validar A, B y C.

## 7. Qué hacer después de cada entrega

Lee el resumen y prueba las instrucciones de README. Usa prompts/revisar_entrega.md si necesitas una revisión. Comprueba que se guardaron código, lockfile, migraciones y documentación; el resumen debe indicar commit y rama/PR. Si tienes que autorizar GitHub, usa prompts/guardar_github.md.

En una sesión nueva usa prompts/continuar_nueva_sesion.md y nombra la fase. Las decisiones, resultados y limitaciones quedan en el repositorio, por lo que no tienes que reconstruir la conversación. Con Pro, este trabajo acotado facilita retomar si alcanzas límites de uso.

La preparación de beta no contrata servicios ni publica en tiendas automáticamente. El hosting persistente, los secretos de producción y la publicación requieren tareas posteriores concretas. Las funciones nativas, auth, pagos y push deben probarse realmente antes de darlos por terminados.

## 8. Comparar con Codex

Haz una primera comparación tras 0–1 y otra tras 5–9, cuando ambas versiones alcancen el mismo punto. Usa los casos de comparacion/CASOS_Y_CRITERIOS.md con entradas y parámetros iguales. Registra errores, funcionamiento real, experiencia móvil, facilidad de instalación y mantenimiento.

Durante la construcción, Claude no recibe el código de Codex. Cuando ambas entregas independientes estén listas, puedes usar prompts/comparar_despues.md para permitir una revisión en modo lectura de las dos. No valorar solo las pantallas ni el número de tests; exigir resultados reproducibles.

## Fuentes de configuración

Verificadas el 8 de octubre de 2026. Las fases y requisitos de APPINITY proceden de tu especificación; estos enlaces documentan las herramientas.

[1] Claude Code Desktop: https://code.claude.com/docs/en/desktop-quickstart

[2] Claude Code con Pro: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan

[3] Claude Code cloud: https://code.claude.com/docs/en/claude-code-on-the-web

[4] Expo, iniciar desarrollo: https://docs.expo.dev/get-started/start-developing/

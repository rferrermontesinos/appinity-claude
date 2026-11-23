# Fases hasta la beta cerrada Android (B1–B10)

Plan del 2026-11-22, con el alcance congelado: solo bloqueantes de la beta, seguridad, privacidad y errores. Cada fase es
una PR encadenada (la base de cada una es la rama de la anterior; la primera parte de la PR #26). Se fusionan en orden y
solo con el visto bueno del titular. El seguimiento vivo está en el documento «APPINITY · Fases hasta la beta cerrada
Android» del proyecto; este fichero es su copia en el repositorio.

| Fase | Qué entrega | Criterio de salida | Estado |
|---|---|---|---|
| B1 · Formato y CI | Prettier con el ancho de línea real del código (160), todo el repositorio formateado y `pnpm format:check` en la CI | `prettier --check` limpio y la CI lo comprueba | PR abierta (#27) |
| B2 · Restos de seguridad | `/health` sin versiones ni errores en producción, User-Agent sin datos personales, cupo diario en la búsqueda por contactos y nueva pasada de `pnpm audit` | Un test por arreglo y ningún aviso alto en la API | PR abierta (#28) |
| B3 · Textos legales y derechos | Política y condiciones coherentes con la app, datos del responsable por variables de entorno con huecos marcados, página pública para pedir la baja (la exige Play) y exportación de los datos de una persona por comando | Tests de las páginas y ningún dato inventado | PR abierta (#29) |
| B4 · Observabilidad (Sentry) | Sentry en la API, el worker y la app, apagado mientras no haya DSN, sin datos personales ni tokens en los eventos | Tests del filtro de datos; sin DSN no se envía nada | PR abierta |
| B5 · Canal de feedback | «Enviar comentario» en Perfil, guardado en la base de datos con versión y plataforma, y un comando para leerlos | Tests de la API (autorización, longitud y cupo) y pantalla revisada en la vista web | Pendiente |
| B6 · Push en la app | `expo-notifications`: permiso, registro del token, canal de Android y abrir la pantalla al tocar; sin fallos en Expo Go ni sin proyecto de EAS | Typecheck y tests de la lógica; la entrega real necesita EAS, Firebase y el teléfono | Pendiente |
| B7 · Rareza al día | Recálculo completo agrupado tras los recálculos parciales, para que todas las parejas usen los mismos pesos de `affinity-v5` | Test: una pareja ajena al usuario que cambió queda con los pesos nuevos | Pendiente |
| B8 · Preparar Google Play (sin publicar) | Build bloqueada si la URL de la API es un marcador, versión visible en Ajustes, permisos revisados, borradores de ficha, seguridad de datos y clasificación, y guía de prueba cerrada | Ficha y formularios listos para copiar | Pendiente |
| B9 · Operación de la beta | Copias cifradas con restauración probada, métricas de la beta sin terceros, guía para probadores y manual de incidencias | Copia cifrada restaurada en una base de prueba; métricas calculadas sobre la demo | Pendiente |
| B10 · Auditoría final | Seguridad, QA, lista de publicación y paso a beta revisados de nuevo sobre todo lo anterior, y documentación al día | Paso a beta en verde salvo lo que solo puede hacer el titular | Pendiente |

## Después de la beta cerrada

1. Ola 1 · Alfa (5–8 personas, 1 semana): todas completan el alta y ven gustos importados en menos de 24 h.
2. Ola 2 · Beta cerrada (25–40 personas en 3–5 grupos de la misma ciudad, 2–3 semanas): al menos el 50 % con un alma
   gemela en 48 h y un 30 % de tarjetas de consenso o descubrimiento. Necesita push (B6) y métricas (B9).
3. Ola 3 · Beta ampliada (hasta 100, el límite de Google en modo Testing): Trending local y retención a 7 días del 30 %.
   Antes, decidir el servidor.
4. Beta abierta: verificación de Google (CASA si se mantienen los permisos restringidos), acceso a producción en Play
   (12 probadores durante 14 días), revisión legal, servidor dedicado, licencia de TMDb y acuerdo con Trakt (o
   retirarlos).
5. iPhone: Apple Developer e «Iniciar sesión con Apple».
6. Patrocinados: mezcla 70/10/10/10.
7. Funciones congeladas hasta después de la beta: exportar datos desde la app, Premium con compras reales, horario
   tranquilo de notificaciones, fuentes nuevas, pruebas automáticas en el dispositivo y calibración de afinidad y rareza
   con datos reales.

## Lo que solo puede hacer el titular

Fusionar las PR en orden; probar el APK nuevo en el teléfono; dominio y túnel; Google Cloud (URL de vuelta, dominio,
probadores); datos del responsable para los textos legales; cuenta de Sentry (región UE); cuenta de Expo, `eas init` y
Firebase para el push; Google Play Console si se reparte por Play (25 USD); decidir si la especificación compartida pasa a
la versión 1.2; ciudad y grupos de las primeras olas y un email de soporte.

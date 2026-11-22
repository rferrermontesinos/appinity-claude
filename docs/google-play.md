# Google Play: todo listo para la prueba cerrada (fase B8)

Estado a 2026-11-22: **preparado, sin publicar**. No se ha creado nada en Play Console ni se ha subido ninguna build.
Este documento reúne lo que pide Google y lo que solo puede hacer el titular. Los textos son borradores: revisarlos con
los textos legales (que también son borrador, ver [beta.md](beta.md)) antes de enviarlos.

## 1. Lo que ya hace el código

- **La build no sale con una URL de ejemplo.** Con los perfiles `preview` y `production` de `apps/mobile/eas.json`, o
  con `APPINITY_RELEASE_BUILD=1` en una build local (lo pone `pnpm android:beta`), `app.config.ts` para la compilación
  si `EXPO_PUBLIC_API_URL` falta,
  sigue siendo `https://CAMBIAR-…` o no es `https://dominio` (sin ruta ni puerto). El mensaje dice qué perfil cambiar.
- **Versión**: `0.2.0` en `app.json`, visible en Ajustes → Conexión con la API → «Versión de la app», y la misma que se
  envía con los comentarios y los avisos de errores. Súbela antes de cada build que repartas (`0.2.1`, `0.3.0`…). El
  número interno de Android (versionCode) lo lleva EAS: `autoIncrement` en el perfil `production`.
- **Permisos de Android**, revisados uno a uno (los añade la app o sus módulos de Expo):

  | Permiso | Para qué | Cuándo se pide |
  |---|---|---|
  | `INTERNET`, `ACCESS_NETWORK_STATE` | Hablar con la API y cargar imágenes | Nunca (permisos normales) |
  | `ACCESS_COARSE_LOCATION` | Fijar una zona aproximada (Ajustes → Ubicación) | Solo al pulsar «Usar mi ubicación» |
  | `READ_CONTACTS` | «Buscar en mis contactos» (sale una huella de cada email, no la agenda) | Solo al pulsar el botón |
  | `POST_NOTIFICATIONS` | El resumen de recomendaciones (B6) | Una vez, tras el alta |
  | `RECEIVE_BOOT_COMPLETED`, `VIBRATE` | Los usa `expo-notifications` | Nunca (permisos normales) |

  Quitados con `blockedPermissions` porque la app no los usa: ubicación precisa, escribir contactos, almacenamiento
  (`READ/WRITE_EXTERNAL_STORAGE`) y «mostrar sobre otras apps» (`SYSTEM_ALERT_WINDOW`, que se queda solo en la build de
  desarrollo para las herramientas de React Native). Comprobado con `expo prebuild`: los cinco quedan con
  `tools:node="remove"`. Las librerías de Firebase que trae `expo-notifications` pueden añadir permisos normales al
  compilar (`WAKE_LOCK` y el de recibir mensajes de FCM); la lista final del AAB se ve en Play Console → Explorador de
  app bundle. **Sin probar en el teléfono**: con solo ubicación aproximada, Android ofrece «Aproximada» en el diálogo y
  `expo-location` la da por concedida (revisado en su código).
- **Copias de Android**: los datos de `expo-secure-store` (la sesión) quedan fuera de la copia automática de Android.
- **targetSdk 36** (React Native 0.86): cumple el requisito de Play para apps nuevas.

## 2. Ficha de la tienda (borrador)

- **Nombre** (máx. 30): `APPINITY`. En el teléfono, bajo el icono, sigue poniendo «APPINITY (Claude)» (`app.json`),
  para distinguirla de la otra implementación.
- **Descripción breve** (73 de 80 caracteres): «Recomendaciones de tus almas gemelas y personas que comparten tus gustos.»
- **Descripción completa** (unos 1.300 de 4.000 caracteres):

  > APPINITY te recomienda películas, series, música, libros, juegos, podcasts, restaurantes y planes culturales a partir
  > de lo que les gusta a tus almas gemelas: las personas cuyos gustos se parecen más a los tuyos.
  >
  > **Cómo funciona**
  > • Conecta las fuentes que quieras (Google, Steam y otras) o vota en la app: No me gusta, Me gusta y Me encanta. Con
  > eso APPINITY construye tu perfil de gustos, que crece cada vez que votas.
  > • Vuestra afinidad se calcula solo con lo que conocéis los dos, y coincidir en algo poco común cuenta más que
  > coincidir en lo que gusta a todo el mundo.
  > • Cada recomendación dice de dónde sale: de tus almas gemelas, de lo que se valora en tu zona o de algo nuevo por
  > descubrir.
  > • Conoce a las personas que comparten tus gustos: amistades, sus descubrimientos en tu Inicio y chat cuando el interés
  > es mutuo.
  >
  > **Tu privacidad**
  > • La afinidad solo usa gustos: nunca fotos, edad, género, origen ni lo que escribes.
  > • Nadie ve tu historial. Con «Lo que os une» (apagado por defecto) veis hasta 5 obras que os gustan a los dos.
  > • Sin anuncios y sin venta de datos. Puedes desconectar una fuente y borrar lo importado, o eliminar tu cuenta desde
  > la app.
  >
  > **Beta cerrada**: la app está en pruebas y puede cambiar o fallar. Cuéntanos qué tal desde Perfil → Enviar comentario.
  >
  > Solo para mayores de 18 años.

- **Categoría**: Social (tiene chat y amistades; no es una app de citas). Alternativa: Entretenimiento.
- **Datos de contacto**: un email de soporte público (pendiente del titular) y, si se quiere, la web.
- **Gráficos** (borradores en [docs/play](play/)):
  - icono de 512 × 512: [icon-512.png](play/icon-512.png), sacado del icono de la app;
  - gráfico destacado de 1024 × 500: [feature-graphic-1024x500.png](play/feature-graphic-1024x500.png);
  - capturas del teléfono (de 2 a 8): hacerlas con la **demo** (personas ficticias), con `pnpm dev` y el APK de
    desarrollo, **nunca con cuentas reales de testers**. Sugeridas: Inicio con una tarjeta, Personas (almas gemelas),
    el perfil de un alma gemela con la afinidad, una categoría y «Cómo funciona APPINITY».

## 3. Contenido de la app (Play Console → Política → Contenido de la app)

| Apartado | Respuesta propuesta |
|---|---|
| Política de privacidad | `https://api.<dominio>/legal/privacidad` (pública, sin sesión) |
| Acceso a la app | Hace falta iniciar sesión con Google. Crear una cuenta de Google solo para la revisión, añadirla como usuaria de prueba en Google Cloud (pantalla de consentimiento, modo Testing) y poner su email y contraseña aquí, nunca en el repositorio |
| Anuncios | No contiene anuncios |
| Clasificación de contenido | Cuestionario IARC: ver el apartado 5 |
| Público objetivo | Solo mayores de 18 años (lo exigen las condiciones). Sin atractivo para menores |
| Apps de noticias, gobierno, funciones financieras, salud | No |
| Seguridad de los datos | Ver el apartado 4 |
| Eliminación de cuenta | Dentro de la app (Perfil → Ajustes → Eliminar mi cuenta) y en `https://api.<dominio>/legal/eliminar-cuenta` |
| Contenido generado por usuarios | Chat entre personas. Hay bloqueo y reporte en la app, normas en las condiciones, revisión diaria de los reportes y suspensión de cuentas (`pnpm reports:list` y `pnpm account:suspend`, fase B9; ver [incidencias.md](incidencias.md#una-persona-reportada)) |

## 4. Seguridad de los datos (borrador del formulario)

Sale de la política de privacidad (`apps/api/src/legal/texts.ts`). Si cambia una, cambiar la otra.

- **¿Recoge o comparte datos?** Sí recoge. No comparte: los proveedores técnicos (alojamiento, Cloudflare, Expo y
  Firebase para las notificaciones, Sentry si está activo) actúan por cuenta de APPINITY, y Google no lo cuenta como
  compartir. Enviar un mensaje a otra persona lo decide quien lo envía.
- **Cifrado en tránsito**: sí (HTTPS). **Se puede pedir el borrado**: sí (en la app y en la página pública).

| Tipo de dato (categoría de Play) | ¿Obligatorio? | Para qué | Notas |
|---|---|---|---|
| Nombre, dirección de correo, IDs de usuario (Información personal) | Sí | Funciones de la app, gestión de la cuenta | Los da Google al entrar; el nombre visible se elige en el alta |
| Ubicación aproximada | No | Funciones de la app | Ciudad o zona redondeada, sin historial |
| Otros mensajes en la app (Mensajes) | No | Funciones de la app | El chat |
| Interacciones con la app y otras acciones (Actividad en apps) | Sí | Funciones de la app, personalización | Votos, descartes y recomendaciones vistas; lo importado de las fuentes (notas, juegos, lo visto) |
| Otro contenido generado por el usuario (Actividad en apps) | No | Funciones de la app, analíticas | Reseñas importadas, comentarios de la beta y reportes |
| Eventos del calendario (Calendario) | No | Personalización | Solo el lugar u obra identificado, cuántas veces y la fecha; nunca títulos ni asistentes |
| Contactos | No | Funciones de la app | Procesados de forma efímera: llega una huella de cada email y no se guarda |
| Registros de fallos y diagnósticos (Información y rendimiento) | No | Analíticas | Solo con `SENTRY_DSN`; sin datos personales (filtro de B4) |
| ID del dispositivo u otros (token de notificaciones) | No | Funciones de la app | Para enviar el resumen |

No se recogen: fotos o vídeos, audio, archivos, información financiera, salud, historial web ni apps instaladas.

## 5. Clasificación de contenido (borrador del cuestionario IARC)

- **Tipo de app**: redes sociales, foros y contenido generado por usuarios (por el chat).
- **Violencia, sexo, lenguaje, drogas, apuestas** en el contenido propio de la app: no. La app enseña títulos y carteles
  de obras de todas las edades (también películas para adultos), sin contenido explícito.
- **Las personas usuarias pueden interactuar o intercambiar contenido**: sí (chat y amistades).
- **Comparte la ubicación física con otras personas**: no (solo cuentan, sin nombre, las tendencias de la zona).
- **Compras digitales**: no (Premium no se vende en la beta).
- **Navegación web sin restricciones**: no (los enlaces se abren en el navegador del teléfono).

## 6. Paso a paso de la prueba cerrada

Antes de Play hay una vía gratis: el APK firmado en el PC (`pnpm android:beta`), que se instala a mano. Sirve para la ola
de alfa (5–8 personas). Para la beta conviene Play: instalar y actualizar es más fácil y Google lo exige para publicar.

1. **Cuenta de desarrollador** (pago único de 25 USD y verificación de identidad). Las cuentas personales nuevas tienen
   que hacer una prueba cerrada con al menos **12 testers durante 14 días seguidos** antes de pedir el acceso a
   producción.
2. **Crear la app**: idioma español (España), nombre, app (no juego), gratuita, y aceptar las declaraciones.
3. **Rellenar** la ficha (apartado 2) y el contenido de la app (apartados 3 a 5).
4. **La build**: poner la URL pública de la API en el perfil `production` de `apps/mobile/eas.json` (si no, la build se
   para con un mensaje claro) y ejecutar `eas build --platform android --profile production`. Sale un AAB firmado con la
   clave de subida que guarda EAS; Google firma la versión final (firma de apps de Play). La primera subida se hace a
   mano en Play Console.
5. **Pruebas → Prueba cerrada**: crear la pista, añadir a los testers (una lista de emails o un grupo de Google), subir
   el AAB, escribir las notas de la versión y enviarla a revisión. Google también revisa las pruebas cerradas; suele
   tardar de horas a unos días.
6. **Los mismos testers en Google Cloud**: con la pantalla de consentimiento en modo Testing, solo pueden entrar los
   usuarios de prueba (máximo 100). Cada tester tiene que estar en las dos listas, con la misma cuenta de Google.
7. **Enlace de participación**: Play Console lo da al publicar la pista. Cada tester lo abre con su cuenta, acepta y
   descarga la app desde Play.
8. **Actualizar**: subir la versión en `app.json`, `eas build` de nuevo (el versionCode sube solo) y otra versión en la
   misma pista.

Para la ola de alfa también vale la **prueba interna** de Play: hasta 100 personas, sin revisión y disponible en
minutos, pero no cuenta para los 14 días.

## 7. Lo que solo puede hacer el titular

1. Dominio y túnel, y la URL pública en los perfiles `preview` y `production` de `eas.json`.
2. Cuenta de Expo (también para las notificaciones de B6).
3. Cuenta de Play Console (25 USD) y verificación de identidad.
4. Un email de soporte para la ficha y los textos legales.
5. La cuenta de Google para la revisión, como usuaria de prueba en Google Cloud.
6. Las capturas con la demo.
7. **Decidir el identificador de la app antes de la primera subida**: hoy es `dev.appinity.claude` y, una vez subido a
   Play, no se puede cambiar nunca. También el nombre de la ficha.

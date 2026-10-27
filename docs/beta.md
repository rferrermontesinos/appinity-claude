# Beta de APPINITY · estado y lo que falta (fase 13, 2026-10-15)

## Recorrido extremo a extremo y su estado

| Paso | Estado | Cómo se ha comprobado |
|---|---|---|
| Entrar con Google (producción) | **Implementado** | Tests: OpenID Connect con claves locales (firma, emisor, audiencia, caducidad, nonce) y HTTP (código de un solo uso, rotación, cierre de sesión). Vista web: botón visible, canje del código, alta y Perfil. **Probado con Google real en el PC (2026-10-15)**: cuenta `live` creada con email verificado, alta completada y sesión activa |
| Alta: mayoría de edad y condiciones | **Implementado** | Test HTTP y vista web (alta → Perfil) |
| Conectar fuentes (único consentimiento) | Google y Steam implementados | Sync real de Google con tu cuenta: 115 evidencias. Steam: fases anteriores |
| Sync, perfil, afinidades, recomendaciones | Implementados | Fases 2 a 11, con datos reales |
| Chat, amigos, bloqueo, reporte | Implementados | Fases 10 y 12A, aceptadas en el teléfono |
| Desconexión y eliminación de cuenta | **Implementado** | Test HTTP y vista web: eliminar borra usuario, identidad y sesiones, y vuelve al login |
| Premium | Servidor listo | Webhooks probados con eventos simulados; sin compra real |
| Notificaciones | Servidor listo, con recibos | Envío y recibos simulados; sin entrega real |
| Despliegue | Preparado | Pila de producción levantada en local; copia de seguridad y restauración probadas |

## Lo que falta antes de una beta real (requiere tus cuentas o decisiones)

1. **Dominio con HTTPS y un servidor**: un VPS pequeño basta para la beta. Sin él, Google solo vuelve a `localhost` y el
   teléfono no puede iniciar sesión.
2. **Google Cloud**:
   - autorizar las URL de vuelta de producción, la de inicio de sesión y la de Data Portability;
   - **verificación de la app**: los scopes «Restricted» de Data Portability exigen la evaluación de seguridad (CASA)
     para salir del modo Testing. En Testing el permiso dura 7 días y solo para usuarios de prueba.
3. **EAS** (`eas init`) y una **build de desarrollo o preview** instalada en Android. Es imprescindible para el push y
   las compras.
4. **Firebase (FCM V1)** para el push en Android.
5. **Opcional**: RevenueCat y las tiendas para Premium; Apple Developer Program para iOS («Iniciar sesión con Apple»
   es obligatorio en iOS si se ofrece Google).
6. **Textos legales**: condiciones y política de privacidad (el alta ya pide aceptarlas).

## Nota sobre cuentas (2026-10-15)

La cuenta de Google es nueva y está vacía; los gustos del usuario siguen en su cuenta local de desarrollo. Pasar fuentes a otra cuenta tiene dos límites:
- Google: un export por grupo cada 24 h.
- Steam: una cuenta de Steam solo puede estar vinculada a un usuario a la vez.

## Probar el inicio de sesión real en el PC (hecho)

1. En Google Cloud → tu cliente OAuth → «URIs de redireccionamiento autorizados», añade
   `http://localhost:3100/v1/auth/google/callback`.
2. Reinicia la API: `AUTH_SECRET` ya está generado en tu `.env`.
3. En `http://localhost:8092`, cierra la sesión de desarrollo («Cambiar de usuario») y pulsa «Continuar con Google».

## Auditoría de seguridad de la API (2026-10-26)

Revisión de todas las rutas de `apps/api` (sin herramientas externas):

- **Sesión**: un guard global exige sesión en todo lo que no se marca `@Public()`. Las públicas son: salud, inicio de
  sesión con Google, imágenes del catálogo (solo `catalog/`, sin datos personales), retorno de las fuentes (con `state`),
  el webhook de RevenueCat (secreto comparado en tiempo constante) y el acceso de desarrollo, que la configuración
  prohíbe con `NODE_ENV=production`.
- **Autorización por recurso**: conexiones, perfiles propios, solicitudes de amistad y de chat, conversaciones,
  afinidades y catálogo filtran por el usuario de la sesión y su dataset. Un recurso ajeno responde 404. Hay tests para
  conexiones, evidencias, afinidades, bloqueos y, desde esta revisión, para responder solicitudes ajenas y leer, marcar
  o borrar una conversación ajena.
- **Secretos**: ningún `.env`, clave ni copia de seguridad en Git; los tests usan valores simulados; ningún log
  escribe tokens.
- **Arreglado**: detrás del proxy HTTPS todas las peticiones llegaban con la IP del proxy, así que el límite de
  peticiones (300 por minuto y IP) se habría repartido entre todos los usuarios. Ahora `TRUST_PROXY` (en
  `docker-compose.prod.yml`: `loopback, uniquelocal`) permite leer la IP real. Solo admite rangos o subredes, nunca
  «confiar en todo».
- **Pendiente con servidor real**: revisar las cabeceras del proxy (HSTS) y repetir la revisión con la evaluación CASA
  de Google.

## Prueba con amigos y familiares: alta única (2026-10-26)

### Qué hace ya la app

1. **«Continuar con Google»**: crea la cuenta y concede Google Books y Calendar en el mismo consentimiento. Se guardan
   los permisos, pero **no se importa nada** todavía.
2. **Alta**: mayoría de edad y condiciones. Al pulsar «Aceptar y empezar a importar»:
   - arranca el primer sync de Books y Calendar (`POST /v1/me/connections/initial-import`);
   - se abre en seguida el consentimiento de **Google Data Portability**: reseñas y guardados de Maps, valoraciones de
     búsquedas, YouTube y YouTube Music, Google Play y reservas.
   Google obliga a que esa sea una segunda pantalla suya (no deja mezclar sus scopes con los del inicio de sesión),
   pero la persona no tiene que ir a Perfil ni conectar fuente a fuente.
3. El servidor **rechaza importar o conectar** cualquier fuente de una cuenta real que aún no ha aceptado las
   condiciones. Antes, Books y Calendar se sincronizaban al volver de Google, antes del alta.

Steam, AniList, Trakt y Facebook siguen siendo opcionales en Perfil: son cuentas de otros proveedores y cada una exige
su propio inicio de sesión (no se pueden autorizar con el consentimiento de Google).

### Puesta en marcha con Cloudflare Tunnel y dominio propio (decisión del titular, 2026-10-26)

La API sigue en el PC; Cloudflare la publica en `https://api.<tu-dominio>`. El acceso de desarrollo (`/v1/dev`, modo
demo) **no** se publica: el túnel lo responde con 404. El PC tiene que estar encendido durante la prueba.

**Lo que haces tú (una vez):**

1. **Cuenta y dominio**: en [dash.cloudflare.com](https://dash.cloudflare.com) crea la cuenta y, en «Domain
   Registration → Register Domains», compra el dominio (un `.com` cuesta unos 10 € al año, a precio de coste). Al
   comprarlo en Cloudflare, su DNS ya queda allí.
2. **Instalar cloudflared** (en tu terminal): `winget install --id Cloudflare.cloudflared` y abre una terminal nueva.
3. **Iniciar sesión**: `cloudflared tunnel login`. Se abre el navegador; elige tu dominio y autoriza.
4. **Crear el túnel**: `pnpm tunnel:setup -Domain tudominio.com`. Crea el túnel `appinity-claude`, el DNS
   `api.tudominio.com`, la configuración (en `~/.cloudflared`, fuera de Git) y apunta `.env` a la URL pública.
   Al terminar imprime las URL de vuelta para Google.
5. **Google Cloud** (consola → «APIs y servicios»):
   - Credenciales → tu cliente OAuth → «URIs de redireccionamiento autorizados»: añade las tres que imprime el paso 4
     (`/v1/auth/google/callback`, `/v1/connect/google_books/callback` y `/v1/connect/google_portability/callback`).
     Deja también las de `http://localhost:3100`.
   - Pantalla de consentimiento → «Branding» → dominios autorizados: añade `tudominio.com`.
   - Pantalla de consentimiento → «Audience» → usuarios de prueba: añade el Gmail de cada persona (máximo 100).
6. **Reiniciar** `pnpm api` y `pnpm worker`. Después, en otra pestaña, `pnpm tunnel` (déjala abierta).
7. **Comprobar**: `https://api.tudominio.com/health` responde, y `https://api.tudominio.com/v1/dev/session`
   devuelve 404.

**Lo que hago yo después**: `pnpm android:beta -ApiUrl https://api.tudominio.com` → `dist/appinity-beta.apk` (la app
empaquetada; no necesita Metro), y la prueba completa del alta con Google desde el teléfono.

**Para tus amigos**: les pasas el APK (Drive o WhatsApp como archivo); en Android tienen que permitir «instalar apps
desconocidas». Al entrar con Google verán «Google no ha verificado esta app» → «Continuar», porque la app está en modo
Testing. El permiso de Data Portability caduca a los 7 días.

**Para volver a solo local**: `pnpm public-url --local` y reiniciar la API.

### Lo que falta para que funcione en el teléfono de otra persona (decisiones del titular)

1. **Una URL pública con HTTPS para la API.** Google solo vuelve a `localhost` o a un https, y el teléfono de un amigo
   no llega al PC. Opciones:
   - **Cloudflare Tunnel con un dominio propio** (recomendada): la API sigue en el PC, gratis salvo el dominio (unos
     10 € al año). URL fija; el PC tiene que estar encendido durante la prueba.
   - Túnel rápido de Cloudflare (`trycloudflare.com`): gratis y sin cuenta, pero la URL cambia en cada arranque y
     obliga a registrarla de nuevo en Google y a recompilar el APK. Solo sirve para una prueba de una tarde.
   - Servidor (VPS) y dominio: el plan de la beta (arriba), de pago.
2. **Google Cloud** (modo Testing, sin verificación):
   - añadir el **Gmail de cada persona como usuario de prueba** (máximo 100);
   - registrar las URL de vuelta `https://<dominio>/v1/auth/google/callback` y la de Data Portability
     (`/v1/connect/google_portability/callback`);
   - Google mostrará el aviso de «app no verificada» (hay que pulsar «Continuar»), y el permiso de Data Portability
     caduca a los 7 días.
3. **APK de prueba**: el actual (`pnpm android:build`) es de desarrollo y necesita Metro en el PC. Hace falta un APK
   con la app empaquetada y `EXPO_PUBLIC_API_URL=https://<dominio>`; con `PUBLIC_API_URL` igual en la API.
4. **Tiempos**: Google prepara el export de Data Portability en minutos u horas; los gustos van apareciendo solos.


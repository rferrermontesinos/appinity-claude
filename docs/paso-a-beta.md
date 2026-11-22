# Paso a la beta cerrada Android (fase B10, 2026-11-22)

Lista para pasar de «todo el código listo» a invitar a la ola 1 (alfa, 5–8 personas). El código de las fases B1 a B10
está hecho y probado; lo que queda necesita tus cuentas, tus datos o tus decisiones. Plan y estado de cada fase en
[fases-beta.md](fases-beta.md).

## 1. Lo que ya está hecho en el código

| Fase | Qué deja listo | Comprobado |
|---|---|---|
| B1 | Formato, lint, tipos y tests en la CI de cada push | CI |
| B2 | `/health` sin detalles en producción, User-Agent sin datos personales y cupo diario en la búsqueda por contactos | Tests |
| B3 | Política, condiciones y página de baja (`/legal/eliminar-cuenta`) con los datos del responsable por variables; exportar y borrar los datos de una persona por comando | Tests |
| B4 | Avisos de errores con Sentry, apagados mientras no haya DSN y sin datos personales | Tests |
| B5 | «Enviar comentario» en Perfil y `pnpm feedback:list` | Tests y vista web |
| B6 | Notificaciones push en la app | Tests de la lógica; la entrega real necesita EAS, Firebase y el teléfono |
| B7 | Rareza al día en todas las parejas | Tests |
| B8 | Google Play preparado sin publicar: ficha, formularios, permisos y versión visible | `expo config` y `expo prebuild` |
| B9 | Copias cifradas con restauración, moderación, métricas, guía para testers y manual de incidencias | Tests y restauración real en PostgreSQL |
| B10 | Auditoría final: la identidad de desarrollo, cerrada también en la API; los testers ya no ven la demo al entrar; imagen de producción reparada y probada | Tests, vista web y la imagen arrancada |

## 2. Lo que te toca, en orden

1. **Fusionar las PR #26 a #36, en ese orden**, con «Create a merge commit», como las anteriores. Cada PR sale de la
   anterior. Si al llegar a una sigue apuntando a la rama de la previa, borra esa rama ya fusionada («Delete branch»):
   GitHub la reapunta sola a `main`.
2. **Decidir el identificador de la app** antes de la primera subida a Play. Hoy es `dev.appinity.claude` y después no
   se puede cambiar nunca ([google-play.md](google-play.md#7-lo-que-solo-puede-hacer-el-titular)). Para el APK de la
   ola 1 no hace falta todavía.
3. **Dominio y túnel**: los pasos de [beta.md](beta.md#puesta-en-marcha-con-cloudflare-tunnel-y-dominio-propio-decisión-del-titular-2026-10-26)
   (un `.com` cuesta unos 10 € al año). `pnpm tunnel:setup` ya genera la regla que bloquea `/v1/dev` sin distinguir
   mayúsculas.
4. **Google Cloud**: las tres URL de vuelta que imprime `pnpm tunnel:setup`, el dominio autorizado y el **Gmail de cada
   tester** como usuario de prueba (máximo 100). Mismo apartado de [beta.md](beta.md).
5. **Datos legales**: `LEGAL_CONTROLLER_NAME` y `LEGAL_CONTACT_EMAIL` en `.env` (y NIF y dirección si la revisión
   legal lo pide), y reiniciar la API. Hasta entonces las páginas legales muestran «[pendiente: …]»
   ([operations.md](operations.md#secretos-envproduction)). La revisión por un profesional, antes de la ola 2.
6. **Un email de soporte**: para los textos legales, la ficha de Play, la guía de testers y las suspensiones. Puede ser
   el mismo que `LEGAL_CONTACT_EMAIL`.
7. **Sentry**: el DSN de tu proyecto (región UE) en `SENTRY_DSN` de `.env`, con `SENTRY_ENVIRONMENT=beta`, y reiniciar
   API y worker ([operations.md](operations.md#avisos-de-errores-sentry-fase-b4)).
8. **Expo, EAS y Firebase** para el push: `eas init`, `google-services.json` y la clave de FCM V1 en EAS. Después,
   `pnpm push:test --handle <tu handle>` ([operations.md](operations.md#notificaciones-push-fase-b6)).
9. **El APK de la ola 1**: `pnpm android:beta -ApiUrl https://api.<tu-dominio>`, instalarlo en tu teléfono y hacer la
   prueba de humo del apartado 3.
10. **Copias**: guardar `BACKUP_ENCRYPTION_KEY` en un gestor de contraseñas, programar la copia diaria (`schtasks`) y
    comprobar una con `pnpm db:restore <copia>`
    ([operations.md](operations.md#copias-de-seguridad-cifradas-desde-la-fase-b9)).
11. **Testers**: la lista de Gmail, la ciudad y los grupos de cada ola, y rellenar los corchetes de la
    [guía para testers](guia-testers.md).
12. **Play Console** (25 USD), solo si la ola 2 se reparte por Play: [google-play.md](google-play.md#6-paso-a-paso-de-la-prueba-cerrada).
13. **Especificación 1.2**: cuando quieras; no frena la beta.

## 3. Prueba de humo antes de invitar a nadie

En el PC:

- Después de fusionar: `git pull`, `pnpm install` (hay dependencias nuevas), `pnpm db:migrate` (B9 trae la migración
  0023) y reiniciar `pnpm api` y `pnpm worker` (los dos compilan antes de arrancar).
- `pnpm doctor` sin errores: contenedores, API, textos legales, Sentry, clave de las copias y última copia de menos de
  36 h. En `http://127.0.0.1:3100/health`, el worker con latido.

Desde el teléfono, con datos móviles (sin la wifi de casa):

- `https://api.<tu-dominio>/health` responde `"status":"ok"`.
- `https://api.<tu-dominio>/v1/dev/session` y `https://api.<tu-dominio>/V1/DEV/session` dan 404.
- En el APK, con un Gmail de prueba que esté en los usuarios de prueba: «Continuar con Google», el alta y la
  importación en marcha. La pantalla de entrada solo enseña «Continuar con Google» (la demo no aparece).
- Votar unas cuantas tarjetas, abrir Personas, enviar un comentario (y verlo con `pnpm feedback:list`), reportar a
  alguien (y verlo con `pnpm reports:list`) y recibir `pnpm push:test`.
- Borrar esa cuenta de prueba desde Perfil y comprobar con `pnpm beta:metrics` que ya no cuenta.

## 4. Riesgos conocidos y aceptados para la beta cerrada

- **El PC tiene que estar encendido** durante la prueba: la API vive en él.
- **Google en modo Testing**: aviso de «app no verificada», máximo 100 testers y el permiso de Data Portability dura
  7 días. Salir de ahí exige la verificación de Google (CASA), después de la beta.
- **La identidad de desarrollo sigue encendida en el PC**, para tu cuenta local. Desde fuera la cierran dos barreras:
  el túnel responde 404 a `/v1/dev` (la regla que crea `pnpm tunnel:setup`; se comprueba en la prueba de humo) y la API
  ya no confunde `/V1/DEV`, `/v1//dev` ni `/v1/%64ev` con `/v1/dev` (comprobado con tests). Si quieres una tercera,
  `DEV_AUTH_ENABLED=false` en `.env`; entonces tu cuenta local deja de estar accesible hasta que lo vuelvas a encender.
- **`/health` en modo desarrollo** enseña detalles técnicos a través del túnel (versión de PostGIS, latido del worker),
  nada personal. En producción (`NODE_ENV=production`) desaparecen.
- **Avisos de `pnpm audit` en herramientas de desarrollo**: drizzle-kit (esbuild), la CLI de Expo (uuid, glob, zod 3) y
  ESLint (minimatch). No se ejecutan en el servidor ni van dentro de la app, y arreglarlos exige saltos de versión mayor
  de esas herramientas.
- **La imagen de Docker pesa unos 1,2 GB**: el modo plano de pnpm arrastra paquetes de la app móvil. Funciona igual
  (comprobado: migraciones, API y worker en modo producción).
- **Sin iPhone** hasta tener Apple Developer e «Iniciar sesión con Apple».

# Manual de incidencias de la beta (fase B9)

Qué hacer cuando algo falla durante la beta cerrada. Está pensado para la beta en el PC del titular: la API y el worker
corren en el PC y Cloudflare Tunnel los publica en `https://api.<dominio>`. Los comandos de un servidor con la pila de
producción están en [operations.md](operations.md).

## Antes de nada

1. **Qué falla, a quién y desde cuándo**: una persona, varias o todas. En el PC, `pnpm doctor` dice qué pieza no
   responde. Desde fuera, `https://api.<dominio>/health` debe dar `status: ok`; si no, `checks` dice si es la base de
   datos, Redis o el worker.
2. **¿Hay datos personales en juego?** Si alguien ha podido ver, cambiar o llevarse datos que no son suyos, ir antes que
   nada a [Sospecha de fuga de datos](#sospecha-de-fuga-de-datos): tiene plazo legal.
3. **Apuntarlo** en el [registro de incidencias](#registro-de-incidencias): fecha y hora, qué pasó, a quién afectó y qué
   se hizo.
4. **Avisar a los testers** solo si les afecta y va para largo (por el grupo de la beta o por email): qué no funciona y
   cuándo se espera que vuelva. Nunca nombres ni datos de otras personas.

## La app no conecta

La app dice que no puede conectar o se queda cargando. Casi siempre es el PC o el túnel:

1. El PC está encendido y no se ha suspendido. Durante la beta, en las opciones de energía de Windows, que no se
   suspenda nunca mientras está enchufado.
2. Docker Desktop abierto y `pnpm services:up` (PostgreSQL y Redis).
3. `pnpm api`, `pnpm worker` y `pnpm tunnel`, cada uno en su terminal y sin errores.
4. `pnpm doctor` en el PC y `https://api.<dominio>/health` desde el móvil con datos móviles, como lo vería un tester de
   fuera.
5. Si `/health` responde pero la app no: en la app, Perfil → Ajustes → «Conexión con la API» enseña la versión y la URL
   con la que se compiló. Si la URL no es la del dominio, hace falta otro APK (`pnpm android:beta -ApiUrl …`).

Si el problema es de Cloudflare (lo dice su página de estado), no hay nada que hacer en el PC: avisar y esperar.

## Un tester no puede entrar

| Qué ve | Por qué | Qué hacer |
|---|---|---|
| «Acceso bloqueado» o «Error 403: access_denied» de Google | Su Gmail no está en los usuarios de prueba (modo Testing) | Google Cloud → Pantalla de consentimiento → Audience → añadirlo (máximo 100). Tiene que ser la misma cuenta con la que entra en Play |
| «Google no ha verificado esta app» | Es normal en modo Testing | Pulsar «Continuar» (la [guía para testers](guia-testers.md) lo explica) |
| «Esta cuenta está suspendida» | Se suspendió por un reporte | Ver [Una persona reportada](#una-persona-reportada) |
| La URL de vuelta da error (`redirect_uri_mismatch`) | Falta la URL de vuelta en el cliente OAuth | Añadir las tres URL que imprime `pnpm tunnel:setup` ([beta.md](beta.md)) |
| La app no conecta | El PC o el túnel | [La app no conecta](#la-app-no-conecta) |

## Los gustos no se importan o dejan de actualizarse

1. `pnpm doctor`: si el worker no tiene latido, arrancarlo (`pnpm worker`). Las importaciones esperan en la cola y siguen
   solas al volver.
2. En la terminal del worker se ve cada trabajo que falla, con la fuente y el motivo.
3. Causas habituales que no son un fallo:
   - **Google Data Portability** prepara el archivo en minutos u horas y solo deja un export por grupo cada 24 h;
   - en modo Testing, **Google retira los permisos de las fuentes a los 7 días**: hay que volver a conectar Google en
     Perfil;
   - **Steam** con el perfil o la biblioteca privados no deja leer nada: el tester tiene que hacerlos públicos en Steam.
4. Si es un proveedor caído (errores de red o 5xx en el worker), los reintentos lo resuelven cuando vuelve. Con Sentry
   activo llega un aviso de tipo `warning` cuando se agotan.

## Un aviso de Sentry

1. Abrir el evento: dice la ruta como patrón (`GET /v1/people/:id`), el código y la pila; o la cola y el tipo de trabajo
   si es del worker.
2. ¿Se repite? Si es uno suelto de un proveedor, esperar. Si se repite o afecta a una función básica (entrar, votar,
   Inicio, chat), arreglarlo en una rama con su test, como cualquier otro cambio.
3. Si un evento lleva algún dato personal a pesar del filtro: **borrar el evento en Sentry**, apuntarlo en el registro y
   añadir el caso a los tests de `scrubEvent` (`packages/observability`) antes de arreglarlo.

## Una persona reportada

Revisar los reportes **a diario** durante la beta: `pnpm reports:list` (detalles en
[operations.md](operations.md#moderación-fase-b9)). `pnpm beta:metrics` dice también cuántos quedan pendientes.

1. **Leer el reporte**: motivo, nota y quién lo hace. Contar cuántas personas distintas han reportado a la misma cuenta y
   si los reportes coinciden.
2. **No leemos los chats.** La política de privacidad no lo contempla: se decide con el motivo, la nota y la repetición.
   Si hace falta, preguntar a quien reporta (desde el email de contacto) qué pasó; si quiere, puede enviar una captura.
3. **Decidir**:
   - **Nada que hacer** (malentendido, un reporte aislado y sin nota): marcarlo como revisado
     (`pnpm reports:list --mark-reviewed`). La persona que reportó ya puede bloquear, y si marcó «bloquear» ya lo está.
   - **Incumple las normas** de convivencia (acoso, suplantación, spam, contenido sexual no solicitado o ilegal):
     suspender con `pnpm account:suspend --handle <h> --confirm <h>`. Cierra sus sesiones y deja de aparecer para nadie;
     sus datos se conservan.
   - **Un posible delito** (amenazas, menores, contenido ilegal): suspender, apuntarlo, no borrar la cuenta (puede hacer
     falta conservar los datos) y pedir consejo legal antes de hacer nada más.
4. **Escribir a la persona suspendida** desde el email de contacto (lo prometen las condiciones), con la
   [plantilla](#suspensión-de-una-cuenta). No decir nunca quién la ha reportado.
5. **Si pide una revisión**, leer lo que cuenta y decidir de nuevo. Para levantar la suspensión:
   `pnpm account:unsuspend --handle <h> --confirm <h>`; vuelve todo como estaba y entra otra vez con Google.
6. Marcar los reportes como revisados y apuntar la decisión en el registro (sin el contenido de los reportes).

La revisión legal debe confirmar si, además del email con el motivo, la normativa de servicios digitales pide algo más
(por ejemplo, el formato de la explicación o un canal de reclamación).

## Sospecha de fuga de datos

Una brecha es cualquier acceso, pérdida o cambio indebido de datos personales: alguien ve datos de otra persona por un
fallo, se pierde o se publica una copia, se filtra un secreto con el que se pueden leer datos, o se pierde el PC.

1. **Contener** en el momento:
   - cortar el acceso desde fuera si el fallo sigue abierto: parar `pnpm tunnel` (Ctrl+C);
   - si hay sesiones en riesgo, cerrarlas todas (cada tester vuelve a entrar con Google):
     ```bash
     docker exec appinity-claude-postgres psql -U appinity_claude -d appinity_claude -c "update auth_sessions set revoked_at = now() where revoked_at is null"
     ```
   - si se ha filtrado un secreto, [rotarlo](#un-secreto-expuesto).
2. **Apuntar a qué hora se supo.** El plazo empieza ahí.
3. **Valorar**: qué datos, de cuántas personas y qué riesgo tienen para ellas (gustos y nombre visible no son lo mismo que
   mensajes, emails o ubicación).
4. **Notificar a la AEPD en 72 horas** (RGPD, art. 33) desde su sede electrónica, salvo que sea improbable que suponga un
   riesgo para las personas. Si aún no se sabe todo, se notifica lo que se sabe y se completa después.
5. **Avisar a las personas afectadas** sin dilación si el riesgo es alto (art. 34), con la
   [plantilla](#aviso-de-una-brecha): qué ha pasado, qué datos, qué se ha hecho y qué pueden hacer. La herramienta
   Comunica-Brecha RGPD de la AEPD ayuda a decidirlo.
6. **Registrarla siempre**, también si no se notifica (art. 33.5), y arreglar la causa con su test.

Con la revisión legal pendiente, ante una brecha real conviene pedir consejo legal en las primeras horas.

## Un secreto expuesto

Si un secreto ha salido del PC (un commit, una captura, un mensaje), cambiarlo ya. Para los que genera `pnpm setup`:
dejar la línea vacía en `.env` y ejecutar `pnpm setup`, que crea uno nuevo y conserva los demás. Después, reiniciar
`pnpm api` y `pnpm worker`.

| Secreto | Cómo se cambia | Qué pasa al cambiarlo |
|---|---|---|
| `AUTH_SECRET` | `pnpm setup` (línea vacía) | Los access tokens dejan de valer; las sesiones se renuevan solas con su refresh token |
| `CREDENTIALS_ENCRYPTION_KEY` | `pnpm setup` (línea vacía) | Hay que volver a conectar las fuentes. Si se filtró junto con la base de datos, es una brecha |
| `BACKUP_ENCRYPTION_KEY` | `pnpm setup` (línea vacía) y una copia nueva al momento | Las copias anteriores solo se abren con la clave antigua: guardarla aparte hasta que roten (14 días). Si se filtró junto con alguna copia, es una brecha |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud → Credenciales → el cliente OAuth → añadir un secreto nuevo y borrar el anterior; `pnpm secret:set GOOGLE_OAUTH_CLIENT_SECRET --clipboard` | Nada para los testers |
| `STEAM_WEB_API_KEY` | steamcommunity.com/dev/apikey → revocar y crear otra; `pnpm secret:set STEAM_WEB_API_KEY` | Nada para los testers |
| `SENTRY_DSN` | Sentry → Client Keys → crear otra y desactivar la anterior | Nada (el DSN no da acceso a los avisos, pero permite enviar ruido) |
| Credenciales del túnel (`~/.cloudflared`) | Parar `pnpm tunnel`, `cloudflared tunnel delete appinity-claude` y `pnpm tunnel:setup -Domain <dominio>` | Unos minutos sin servicio |
| Contraseña de Google o de Cloudflare del titular | Cambiarla y activar la verificación en dos pasos | — |

Un secreto que llegó a Git sigue en el historial aunque se borre el fichero: hay que cambiarlo igualmente.

## Volver a una copia de seguridad

Si la base de datos se ha estropeado o se ha borrado algo por error: parar `pnpm api` y `pnpm worker`, elegir la copia
(las de `backups/` llevan la fecha en el nombre), comprobarla con `pnpm db:restore <copia>` y restaurarla con
`--confirm appinity_claude`. Los detalles están en [operations.md](operations.md#copias-de-seguridad-cifradas-desde-la-fase-b9).

Lo que pasó entre la copia y el fallo se pierde (votos, mensajes, altas). Las importaciones se recuperan solas en la
siguiente sincronización; el resto no. Si alguien se dio de baja después de la copia, volver a borrar su cuenta
(`pnpm account:delete`): una baja no puede deshacerse con una copia.

## Plantillas

### Suspensión de una cuenta

> **Asunto**: Tu cuenta de APPINITY está suspendida
>
> Hola:
>
> Hemos suspendido tu cuenta de APPINITY porque [motivo concreto: por ejemplo, «varias personas nos han informado de
> mensajes insistentes después de pedirte que pararas», sin decir quiénes].
>
> Esto incumple las normas de convivencia de las condiciones de uso (apartado 4). Mientras dure la suspensión no puedes
> entrar y tu perfil no aparece para nadie; tus datos se conservan.
>
> Si crees que es un error o quieres contarnos tu versión, contesta a este correo y lo revisaremos. También puedes
> pedirnos una copia de tus datos o que eliminemos tu cuenta.
>
> Un saludo,
> [nombre], APPINITY

### Aviso de una brecha

> **Asunto**: Incidente de seguridad en APPINITY
>
> Hola:
>
> El [fecha] detectamos [qué pasó, en una frase]. Han podido quedar expuestos [qué datos tuyos]. No se han visto
> [lo que no: por ejemplo, contraseñas, que APPINITY no guarda].
>
> Ya hemos [qué se hizo: cerrar el fallo, cerrar las sesiones, cambiar las claves] y lo hemos comunicado a la Agencia
> Española de Protección de Datos.
>
> Te recomendamos [qué puede hacer: por ejemplo, volver a entrar, revisar los permisos de tu cuenta de Google]. Para
> cualquier duda, contesta a este correo.
>
> Un saludo,
> [nombre], APPINITY

## Registro de incidencias

Se guarda **fuera del repositorio** (por ejemplo, una hoja en tu Drive), porque puede llevar datos personales. Una fila
por incidencia:

| Fecha y hora | Qué pasó | A quién afectó | Datos personales | Qué se hizo | ¿Notificada? |
|---|---|---|---|---|---|
| 2026-12-03 21:10 | Ejemplo: el PC se suspendió y la API no respondía | Todos, 40 min | No | Suspensión desactivada | No aplica |

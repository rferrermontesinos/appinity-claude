/**
 * Textos legales (fase 13, revisados en la fase B3 el 2026-11-22). BORRADOR: deben revisarlos una persona experta en
 * derecho antes de la beta pública. Describen lo que hace el código hoy; si cambia el tratamiento de datos, hay que
 * actualizarlos a la vez (y LEGAL_UPDATED).
 *
 * Los datos del responsable salen de variables de entorno (LEGAL_*). No son secretos, pero tampoco se inventan: mientras
 * falten, la página muestra el hueco marcado («[pendiente: …]») y la API lo avisa al arrancar en producción.
 */
export const LEGAL_UPDATED = '2026-11-22';

/** Datos del responsable del tratamiento. `null`: el titular aún no lo ha dado. */
export interface LegalInfo {
  /** Nombre y apellidos o razón social. */
  controllerName: string | null;
  /** NIF o CIF (la LSSI lo exige si hay actividad económica). */
  controllerId: string | null;
  /** Dirección postal (ídem). */
  controllerAddress: string | null;
  /** Email para privacidad, derechos y bajas. */
  contactEmail: string | null;
}

export interface LegalEnv {
  LEGAL_CONTROLLER_NAME?: string | undefined;
  LEGAL_CONTROLLER_ID?: string | undefined;
  LEGAL_CONTROLLER_ADDRESS?: string | undefined;
  LEGAL_CONTACT_EMAIL?: string | undefined;
}

const clean = (value: string | undefined) => value?.trim() || null;

export function legalInfoFromEnv(env: LegalEnv): LegalInfo {
  return {
    controllerName: clean(env.LEGAL_CONTROLLER_NAME),
    controllerId: clean(env.LEGAL_CONTROLLER_ID),
    controllerAddress: clean(env.LEGAL_CONTROLLER_ADDRESS),
    contactEmail: clean(env.LEGAL_CONTACT_EMAIL),
  };
}

/** Variables imprescindibles que faltan (NIF y dirección se recomiendan; ver docs/operations.md). */
export function missingLegalInfo(info: LegalInfo): string[] {
  return [...(info.controllerName ? [] : ['LEGAL_CONTROLLER_NAME']), ...(info.contactEmail ? [] : ['LEGAL_CONTACT_EMAIL'])];
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const gap = (what: string) => `<mark class="gap">[pendiente: ${what}]</mark>`;

function controllerHtml(info: LegalInfo): string {
  const name = info.controllerName ? escapeHtml(info.controllerName) : gap('nombre y apellidos o razón social del responsable');
  const id = info.controllerId ? `, NIF ${escapeHtml(info.controllerId)}` : '';
  const address = info.controllerAddress ? `, ${escapeHtml(info.controllerAddress)}` : '';
  return `${name}${id}${address}`;
}

function contactHtml(info: LegalInfo, subject?: string): string {
  if (!info.contactEmail) return gap('email de contacto para privacidad');
  const email = escapeHtml(info.contactEmail);
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `<a href="mailto:${email}${query}">${email}</a>`;
}

/** Lo que cambia la política según la configuración del servidor. */
export interface PrivacyOptions {
  /** Avisos de errores activos (SENTRY_DSN): Sentry pasa a ser un proveedor técnico más. */
  errorReports?: boolean;
}

export function privacyHtml(info: LegalInfo, options: PrivacyOptions = {}): string {
  return `
<h1>Política de privacidad de APPINITY</h1>
<p class="meta">Última actualización: ${LEGAL_UPDATED}</p>

<h2>1. Quién trata tus datos</h2>
<p>Responsable: ${controllerHtml(info)}. Contacto para cualquier asunto de privacidad: ${contactHtml(info)}.</p>

<h2>2. Qué datos tratamos y de dónde salen</h2>
<ul>
  <li><strong>Tu cuenta</strong>: el identificador, el nombre y el email verificado que nos da Google al iniciar sesión, el
  nombre visible que elijas, tu país y la fecha en que confirmaste que eres mayor de edad y aceptaste las condiciones.</li>
  <li><strong>Tus gustos importados</strong>, solo de las fuentes que conectas. Al darte de alta con Google: tus libros de
  Google Books y tus planes de Google Calendar y, en una segunda pantalla de Google, lo que autorices de Maps
  (valoraciones y lugares guardados), la Búsqueda (valoraciones), YouTube y YouTube Music (actividad, biblioteca y
  suscripciones), Google Play (biblioteca), pedidos y reservas y colecciones guardadas. Si las conectas en Perfil: Steam
  (juegos y horas de juego), Trakt (cine y series), AniList (anime y manga) y Facebook (las páginas que te gustan). De cada
  fuente guardamos las obras y lugares que identificamos y la evidencia necesaria (por ejemplo, una nota o que lo has
  visto). Del calendario solo guardamos el lugar u obra identificado, cuántas veces y la fecha más reciente; nunca
  títulos, descripciones ni asistentes.</li>
  <li><strong>Tus votos en la app</strong>: «No me gusta», «Me gusta» y «Me encanta» cuentan como una nota más (la fuente
  «APPINITY»), con el mismo peso que una nota importada. «No lo conozco», deshacer, abrir enlaces, las amistades y el chat
  no cambian tus gustos. También recordamos qué recomendaciones te hemos enseñado y cuáles has descartado, para no
  repetirlas.</li>
  <li><strong>Ubicación aproximada</strong>: la ciudad que indiques o, si lo permites, la zona de tu dispositivo, redondeada
  y sin historial, para recomendaciones cercanas y tendencias de tu zona.</li>
  <li><strong>Actividad social</strong>: amistades y solicitudes, a quién sigues, invitaciones, bloqueos, reportes y los
  mensajes de chat.</li>
  <li><strong>Contactos</strong>: solo si pulsas «Buscar en mis contactos». Del teléfono sale una huella (SHA-256) de cada
  email; la comparamos con las cuentas que permiten que las encuentren así y no la guardamos.</li>
  <li><strong>Datos técnicos</strong>: las sesiones (de cada token guardamos solo una huella), el token de notificaciones
  del dispositivo y el registro de los avisos enviados, y registros de errores y seguridad que no incluyen tus gustos ni
  tus mensajes.</li>
</ul>

<h2>3. Para qué y con qué base</h2>
<ul>
  <li>Calcular tu afinidad con otras personas, recomendarte obras y lugares, y el chat y las amistades: es el servicio que
  pides (ejecución del contrato).</li>
  <li>Importar tus gustos de las fuentes: tu consentimiento. Lo das una sola vez, en el alta, para las fuentes que
  conectes; cada proveedor te muestra además su propia pantalla de permiso. Lo retiras desconectando la fuente o
  eliminando la cuenta.</li>
  <li>Que te encuentren por tu email quienes te tengan en sus contactos, «Lo que os une» y el perfil público de creador:
  tu consentimiento, con interruptores que empiezan apagados. Los dos primeros se eligen en el alta; todos se cambian en
  Ajustes.</li>
  <li>Notificaciones: el permiso de tu teléfono y la frecuencia que elijas en Ajustes.</li>
  <li>Seguridad, prevención de abusos y copias de seguridad: interés legítimo.</li>
</ul>
<p>Elaboramos un perfil de tus gustos para calcular afinidades y recomendaciones. No tomamos con él decisiones con efectos
jurídicos ni que te afecten de forma parecida. La pantalla «Cómo funciona APPINITY» explica qué cuenta y qué no: la
afinidad nunca usa fotos, edad, género, origen, popularidad, tiempo mirando ni mensajes.</p>

<h2>4. Qué ven los demás</h2>
<ul>
  <li>Tu nombre visible, tu país y vuestra afinidad (global y por categoría). Nunca tu historial, tus notas, los lugares
  que has visitado ni lo que has visto.</li>
  <li><strong>Almas gemelas</strong>: si apareces en el ranking de otra persona con una afinidad del 50 % o más, puede ver
  en su Inicio alguna obra que te gusta mucho con tu nombre («Lo descubre…»). Solo se ve la obra y el motivo. Si desactivas
  «Aparecer como alma gemela» (Ajustes), no apareces en el ranking de nadie.</li>
  <li><strong>Amistades y personas que te siguen</strong>: al aceptar una amistad os seguís; quien te sigue ve en su Inicio,
  con tu nombre, algunas de las obras que más te gustan. Solo pueden seguirte tus amistades o, si activas el perfil
  público de creador, cualquier persona.</li>
  <li><strong>Lo que os une</strong>: si los dos lo activáis (apagado por defecto y recíproco), la otra persona ve hasta 5
  obras que os gustan a ambos, sin vuestras notas. Solo con quien aparece como tu alma gemela o es tu amistad, y nunca
  obras que solo te gustan a ti ni las que no te gustan.</li>
  <li><strong>Tendencias de tu zona</strong>: tus notas cuentan de forma agregada, sin tu nombre. Una obra solo aparece
  cuando la han valorado al menos 5 personas de la zona.</li>
</ul>

<h2>5. Datos de Google: uso limitado</h2>
<p>El uso y la transferencia a cualquier otra aplicación de la información recibida de las API de Google se ajustan a la
<a href="https://developers.google.com/terms/api-services-user-data-policy">Política de datos de usuario de los servicios
de API de Google</a>, incluidos los requisitos de uso limitado. Usamos esos datos solo para calcular tus gustos dentro de
APPINITY; no los vendemos, no los usamos para publicidad ni los compartimos con terceros, y no los usamos para entrenar
modelos de inteligencia artificial. Ninguna persona los lee salvo que nos lo pidas, por seguridad o para cumplir la
ley.</p>

<h2>6. Con quién se comparten</h2>
<ul>
  <li>Con nadie para sus propios fines: no vendemos datos.</li>
  <li>Los proveedores que conectas (Google, Steam, Trakt, AniList, Facebook) reciben las peticiones necesarias para leer
  tus datos y, al desconectar, la anulación del permiso cuando la admiten.</li>
  <li>Proveedores técnicos que actúan por cuenta nuestra: el alojamiento del servidor, Cloudflare (conexión segura entre la
  app y el servidor) y Expo con Firebase Cloud Messaging de Google (envío de notificaciones).</li>${
    options.errorReports
      ? `
  <li>Sentry (avisos de errores): cuando la app o el servidor fallan, le enviamos un aviso técnico con el tipo de error, el
  mensaje, la versión y la pantalla. Antes de enviarlo quitamos emails, códigos de acceso, identificadores y direcciones
  IP, y nunca incluye tu nombre, tu cuenta ni tus gustos.</li>`
      : ''
  }
  <li>Para identificar obras y lugares consultamos fuentes públicas (Wikidata y OpenStreetMap): les enviamos solo el nombre
  de la obra, del lugar o de la ciudad, nunca datos que te identifiquen. Algunos carteles de películas y series se cargan
  directamente desde TMDb y TVmaze, que, como cualquier web, ven la dirección IP de tu dispositivo.</li>
</ul>
<p>Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo (por ejemplo, en Estados Unidos).
Solo trabajamos con proveedores que ofrecen las garantías que exige el RGPD, como el Marco de Privacidad de Datos UE-EE. UU.
o las cláusulas contractuales tipo de la Comisión Europea.</p>

<h2>7. Cuánto tiempo</h2>
<p>Mientras tengas la cuenta. Al desconectar una fuente puedes borrar lo importado de ella (Perfil → Fuentes →
«Desconectar y borrar lo importado»). Al eliminar la cuenta pedimos a los proveedores conectados que anulen los permisos
que les diste y lo borramos todo al momento: perfil, gustos, votos, afinidades, amistades, conversaciones (también para la
otra persona) y sesiones. Las copias de seguridad tienen acceso restringido y rotan: lo borrado desaparece también de
ellas en un máximo de 14 días.</p>

<h2>8. Tus derechos</h2>
<p>Puedes acceder a tus datos, rectificarlos, borrarlos, limitar u oponerte a su tratamiento, pedir una copia en un
formato estructurado (portabilidad) y retirar tu consentimiento en cualquier momento escribiendo a ${contactHtml(info)}.
Respondemos en un plazo máximo de un mes. Para eliminar la cuenta sin la app, sigue los pasos de
<a href="/legal/eliminar-cuenta">Eliminar tu cuenta</a>. Si no te atendemos bien, puedes reclamar ante la Agencia
Española de Protección de Datos (<a href="https://www.aepd.es">aepd.es</a>).</p>

<h2>9. Menores</h2>
<p>APPINITY es solo para mayores de 18 años.</p>

<h2>10. Cambios</h2>
<p>Publicaremos aquí cada versión de esta política con su fecha de actualización.</p>
`;
}

export function termsHtml(info: LegalInfo): string {
  return `
<h1>Condiciones de uso de APPINITY</h1>
<p class="meta">Última actualización: ${LEGAL_UPDATED}</p>

<h2>1. El servicio</h2>
<p>APPINITY te muestra recomendaciones a partir de los gustos de personas afines y te permite conocerlas. Lo presta
${controllerHtml(info)}. Durante la beta es gratuito y puede cambiar, fallar o interrumpirse.</p>

<h2>2. Requisitos</h2>
<p>Tener 18 años o más, iniciar sesión con una cuenta propia y dar datos veraces. Una cuenta por persona.</p>

<h2>3. Tus gustos</h2>
<p>Al darte de alta nos autorizas a importar tus gustos de las fuentes que conectes, con los datos que indica la pantalla
de permiso de cada proveedor, y a usar tus votos en la app. Puedes desconectar una fuente cuando quieras. Debes respetar
también las condiciones de cada proveedor.</p>

<h2>4. Normas de convivencia</h2>
<p>No acoses, suplantes a nadie, envíes spam ni compartas contenido ilegal o sexual no solicitado. Eres responsable de lo
que escribes. Puedes bloquear y reportar a cualquier persona. Podemos suspender las cuentas que incumplan estas
normas.</p>

<h2>5. Premium</h2>
<p>Las funciones de pago, cuando existan, se contratarán en la tienda de tu dispositivo y se regirán por sus condiciones
de pago y reembolso.</p>

<h2>6. Responsabilidad</h2>
<p>Las afinidades y recomendaciones son orientativas y se calculan automáticamente. No respondemos de los servicios de
terceros (proveedores, restaurantes, obras) que recomendemos.</p>

<h2>7. Baja</h2>
<p>Puedes eliminar tu cuenta cuando quieras desde la app o siguiendo los pasos de
<a href="/legal/eliminar-cuenta">Eliminar tu cuenta</a>. La privacidad se rige por la
<a href="/legal/privacidad">política de privacidad</a>. Contacto: ${contactHtml(info)}.</p>

<h2>8. Ley aplicable</h2>
<p>Ley española, sin perjuicio de los derechos que te reconozca la normativa de consumo de tu país de residencia.</p>
`;
}

/**
 * Página pública para pedir la eliminación de la cuenta sin instalar la app (la exige Google Play en la sección de
 * seguridad de los datos). Describe el borrado real de DELETE /v1/me y de `pnpm account:delete`.
 */
export function accountDeletionHtml(info: LegalInfo): string {
  return `
<h1>Eliminar tu cuenta de APPINITY</h1>
<p class="meta">APPINITY · ${controllerHtml(info)}</p>

<h2>Desde la app (al momento)</h2>
<ol>
  <li>Abre APPINITY y ve a <strong>Perfil → Ajustes</strong>.</li>
  <li>En «Cuenta», pulsa <strong>Eliminar mi cuenta</strong>.</li>
  <li>Escribe ELIMINAR y pulsa <strong>Eliminar definitivamente</strong>.</li>
</ol>

<h2>Sin la app</h2>
<p>Escribe a ${contactHtml(info, 'Eliminar mi cuenta de APPINITY')} desde el email de la cuenta de Google con la que entras
en APPINITY y pide que eliminemos tu cuenta. Comprobamos que la cuenta es tuya, la eliminamos en un plazo máximo de un mes
y te lo confirmamos por email.</p>

<h2>Qué se borra</h2>
<p>Todo lo que guardamos de ti: cuenta, perfil y ajustes, gustos importados y votos, afinidades, amistades, seguimientos,
invitaciones y bloqueos, solicitudes y conversaciones de chat (también para la otra persona), sesiones y tokens de
notificaciones. Antes pedimos a cada proveedor conectado que lo admita (por ejemplo, Google) que anule el permiso que le
diste a APPINITY.</p>

<h2>Qué se conserva y cuánto tiempo</h2>
<p>Nada en la base de datos. Las copias de seguridad, de acceso restringido, rotan: lo borrado desaparece también de ellas
en un máximo de 14 días.</p>

<h2>Borrar solo una parte</h2>
<p>Sin eliminar la cuenta, puedes borrar lo importado de una fuente en <strong>Perfil → Fuentes → «Desconectar y borrar lo
importado»</strong>, o pedirnos por email que borremos otros datos concretos. Más detalles en la
<a href="/legal/privacidad">política de privacidad</a>.</p>
`;
}

export function legalPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · APPINITY</title>
<style>
  :root { color-scheme: light dark; --bg:#F6F4F1; --text:#1D1A17; --muted:#5F574F; --accent:#5B3FD9; --warn-bg:#FDF1DC; --warn:#7A4B00; }
  @media (prefers-color-scheme: dark) { :root { --bg:#121110; --text:#F2EEE9; --muted:#B8AFA5; --accent:#A592FF; --warn-bg:#3A2A0C; --warn:#F2C26B; } }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 28px; line-height: 1.2; } h2 { font-size: 19px; margin-top: 28px; }
  a { color: var(--accent); } .meta { color: var(--muted); }
  .draft { background: var(--warn-bg); color: var(--warn); padding: 12px 16px; border-radius: 12px; font-weight: 600; }
  mark.gap { background: var(--warn-bg); color: var(--warn); padding: 0 4px; border-radius: 4px; }
  nav { margin-top: 40px; color: var(--muted); font-size: 14px; }
</style></head>
<body><main>
<p class="draft">Borrador pendiente de revisión legal. Puede cambiar antes de la beta pública.</p>
${body}
<nav><a href="/legal/privacidad">Privacidad</a> · <a href="/legal/condiciones">Condiciones</a> · <a href="/legal/eliminar-cuenta">Eliminar tu cuenta</a></nav>
</main></body></html>`;
}

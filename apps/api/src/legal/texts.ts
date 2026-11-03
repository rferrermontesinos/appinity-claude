/**
 * Textos legales (fase 13). BORRADOR: deben revisarlos una persona experta en derecho antes de la beta pública.
 * Los huecos entre corchetes (responsable, contacto) los completa el titular. Describen lo que hace el código hoy;
 * si cambia el tratamiento de datos, hay que actualizarlos a la vez.
 */
export const LEGAL_UPDATED = '2026-10-26';

/** Datos del responsable: se rellenan antes de publicar (no son secretos, pero tampoco se inventan). */
export const CONTROLLER = {
  name: '[Nombre y apellidos o razón social del responsable]',
  contact: '[email de contacto para privacidad]',
};

export const PRIVACY_ES = `
<h1>Política de privacidad de APPINITY</h1>
<p class="meta">Última actualización: ${LEGAL_UPDATED}</p>

<h2>1. Quién trata tus datos</h2>
<p>Responsable: ${CONTROLLER.name}. Contacto: ${CONTROLLER.contact}.</p>

<h2>2. Qué datos tratamos y de dónde salen</h2>
<ul>
  <li><strong>Tu cuenta</strong>: el nombre y el email verificado que nos da Google al iniciar sesión, el nombre visible
  que elijas, tu país y la confirmación de que eres mayor de edad.</li>
  <li><strong>Tus gustos</strong>: solo los que importamos de las fuentes que tú conectas, cada una con su propio
  permiso: Steam (juegos y horas), Google (valoraciones y lugares de Maps, YouTube y YouTube Music, Google Play, libros
  de Google Books y planes de Google Calendar), Trakt (cine y series), AniList (anime y manga) y Facebook (las páginas que te gustan). De cada fuente
  guardamos las obras y lugares identificados y la evidencia necesaria (por ejemplo, una nota o que lo has visto). Del
  calendario solo guardamos el lugar u obra identificado, cuántas veces y la fecha más reciente; nunca títulos,
  descripciones ni asistentes.</li>
  <li><strong>Ubicación aproximada</strong>: la ciudad o zona que indiques, guardada de forma aproximada (sin historial
  GPS), para recomendaciones cercanas y tendencias de tu zona.</li>
  <li><strong>Actividad social</strong>: amistades, solicitudes, bloqueos, reportes y los mensajes de chat con tus
  conexiones.</li>
  <li><strong>Contactos</strong>: solo si pulsas «Buscar en mis contactos». Del teléfono sale una huella (SHA-256) de
  cada email; la comparamos con las cuentas que lo permiten y no la guardamos.</li>
  <li><strong>Datos técnicos</strong>: sesiones, el token de notificaciones del dispositivo y registros de seguridad
  sin contenido personal.</li>
</ul>
<p>Lo que haces dentro de APPINITY (deslizar, conservar, deshacer, amistades o chat) <strong>no cambia</strong> tus
gustos: solo cuentan tus fuentes.</p>

<h2>3. Para qué y con qué base</h2>
<ul>
  <li>Calcular tu afinidad con otras personas y recomendarte obras y lugares: ejecución del servicio que pides.</li>
  <li>Importar datos de cada fuente: tu consentimiento, que retiras al desconectarla.</li>
  <li>Mostrarte a otras personas como alma gemela o a tus contactos: tu consentimiento, con interruptores en Perfil.</li>
  <li>Seguridad, prevención de abusos y copias de seguridad: interés legítimo.</li>
</ul>

<h2>4. Qué ven los demás</h2>
<p>Tu nombre visible, tu país y vuestra afinidad (global y por categoría). Nunca tu historial, tus valoraciones, los
lugares que has visitado ni lo que has visto. Una recomendación atribuida a otra persona solo revela la obra y el motivo.</p>

<h2>5. Datos de Google: uso limitado</h2>
<p>El uso y la transferencia a cualquier otra aplicación de la información recibida de las API de Google se ajustan a la
<a href="https://developers.google.com/terms/api-services-user-data-policy">Política de datos de usuario de los servicios
de API de Google</a>, incluidos los requisitos de uso limitado. Usamos esos datos solo para calcular tus gustos dentro de
APPINITY; no los vendemos, no los usamos para publicidad ni los compartimos con terceros, y no los usamos para entrenar
modelos de inteligencia artificial.</p>

<h2>6. Con quién se comparten</h2>
<p>Con nadie para fines propios. Los proveedores que conectas (Google, Steam, Trakt, AniList, Facebook) reciben las peticiones
necesarias para leer tus datos. Usamos servicios técnicos para alojar la app y enviar notificaciones, que actúan por
cuenta nuestra. Para identificar lugares y obras consultamos fuentes públicas (Wikidata y OpenStreetMap): les enviamos solo el
nombre del lugar u obra, nunca datos que te identifiquen.</p>

<h2>7. Cuánto tiempo</h2>
<p>Mientras tengas la cuenta. Al desconectar una fuente puedes borrar lo importado de ella. Al eliminar la cuenta
(Perfil → Eliminar mi cuenta) se revocan los permisos concedidos y se borra todo; las copias de seguridad cifradas
caducan en 14 días.</p>

<h2>8. Tus derechos</h2>
<p>Puedes acceder, rectificar, borrar, limitar u oponerte al tratamiento, portar tus datos y retirar tu consentimiento
en cualquier momento escribiendo a ${CONTROLLER.contact}. Si no te atendemos bien, puedes reclamar ante la Agencia
Española de Protección de Datos (aepd.es).</p>

<h2>9. Menores</h2>
<p>APPINITY es solo para mayores de 18 años.</p>
`;

export const TERMS_ES = `
<h1>Condiciones de uso de APPINITY</h1>
<p class="meta">Última actualización: ${LEGAL_UPDATED}</p>

<h2>1. El servicio</h2>
<p>APPINITY te muestra recomendaciones a partir de los gustos de personas afines y te permite conocerlas. Lo presta
${CONTROLLER.name}. Durante la beta puede cambiar, fallar o interrumpirse.</p>

<h2>2. Requisitos</h2>
<p>Tener 18 años o más, iniciar sesión con una cuenta propia y dar datos veraces. Una cuenta por persona.</p>

<h2>3. Fuentes conectadas</h2>
<p>Al conectar una fuente nos autorizas a leer los datos indicados en su pantalla de permiso. Puedes desconectarla
cuando quieras. Debes respetar también las condiciones de cada proveedor.</p>

<h2>4. Normas de convivencia</h2>
<p>No acoses, suplantes, envíes spam ni compartas contenido ilegal o sexual no solicitado. Puedes bloquear y reportar a
cualquier persona. Podemos suspender cuentas que incumplan estas normas.</p>

<h2>5. Premium</h2>
<p>Las funciones de pago, cuando existan, se contratan en la tienda de tu dispositivo y se rigen por sus condiciones de
pago y reembolso.</p>

<h2>6. Responsabilidad</h2>
<p>Las afinidades y recomendaciones son orientativas y se calculan automáticamente. No respondemos de los servicios de
terceros (proveedores, restaurantes, obras) que recomendemos.</p>

<h2>7. Baja</h2>
<p>Puedes eliminar tu cuenta en cualquier momento desde Perfil. La privacidad se rige por la
<a href="/legal/privacidad">política de privacidad</a>.</p>

<h2>8. Ley aplicable</h2>
<p>Ley española, sin perjuicio de los derechos que te reconozca la normativa de consumo de tu país de residencia.</p>
`;

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
</style></head>
<body><main>
<p class="draft">Borrador pendiente de revisión legal. Puede cambiar antes de la beta pública.</p>
${body}
</main></body></html>`;
}

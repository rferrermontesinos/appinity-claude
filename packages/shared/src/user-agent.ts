/**
 * User-Agent de las peticiones a servicios públicos (Wikidata, Wikimedia Commons, Wikipedia y Nominatim). Sus políticas
 * exigen identificar la aplicación y dar un contacto, pero ese contacto no debe ser un dato personal del titular.
 *
 * Orden: `OUTBOUND_CONTACT` (URL o email del proyecto) → origen https de `PUBLIC_API_URL` (obligatoria en producción) →
 * en desarrollo, la página del repositorio. En producción nunca se usa el repositorio, que lleva el usuario de GitHub
 * del titular (auditoría de seguridad 2026-11-22, SEC-009).
 */
export const OUTBOUND_PRODUCT = 'APPINITY/0.1';
const DEVELOPMENT_CONTACT = 'https://github.com/rferrermontesinos/appinity-claude';

export interface OutboundUserAgentEnv {
  NODE_ENV?: string | undefined;
  OUTBOUND_CONTACT?: string | undefined;
  PUBLIC_API_URL?: string | undefined;
}

/** Contacto válido: una URL http(s) o un email, sin espacios ni paréntesis (no puede romper la cabecera). */
function validContact(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v || /[\s()]/.test(v)) return null;
  if (/^(mailto:)?[^@:/]+@[^@/]+\.[^@/]+$/.test(v)) return v.startsWith('mailto:') ? v : `mailto:${v}`;
  return /^https?:\/\/[^/?#]+/i.test(v) ? v : null;
}

/** Origen (`https://host[:puerto]`) de una URL https; null si no lo es. Sin `URL`: este paquete no depende del entorno. */
function httpsOrigin(value: string | undefined): string | null {
  const match = /^https:\/\/([^/?#\s]+)/i.exec(value?.trim() ?? '');
  return match ? `https://${match[1]!.toLowerCase()}` : null;
}

export function outboundContact(env: OutboundUserAgentEnv): string | null {
  return validContact(env.OUTBOUND_CONTACT) ?? httpsOrigin(env.PUBLIC_API_URL) ?? (env.NODE_ENV === 'production' ? null : DEVELOPMENT_CONTACT);
}

/** `APPINITY/0.1 (+contacto)`; sin contacto válido en producción, solo la aplicación. */
export function outboundUserAgent(env: OutboundUserAgentEnv, detail?: string): string {
  const contact = outboundContact(env);
  const parts = [detail?.replace(/[()]/g, '').trim(), contact ? `+${contact}` : null].filter(Boolean);
  return parts.length ? `${OUTBOUND_PRODUCT} (${parts.join('; ')})` : OUTBOUND_PRODUCT;
}

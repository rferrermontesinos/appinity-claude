/**
 * URLs de vuelta a la app tras autorizar en un proveedor. Lista blanca para evitar redirecciones abiertas:
 * el esquema propio de la app, Expo Go en una IP privada (desarrollo) y localhost (vista web de desarrollo).
 */
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export function isAllowedReturnUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'appinity-claude:') return true;
  if (url.protocol === 'exp:' || url.protocol === 'exps:') return PRIVATE_HOST.test(url.hostname);
  if (url.protocol === 'http:') return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return false;
}

/** Añade el resultado a la URL de vuelta sin perder lo que ya llevaba. */
export function withResult(returnUrl: string, params: Record<string, string>): string {
  const url = new URL(returnUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

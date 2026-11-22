/**
 * Invitación pendiente: quien abre un enlace sin sesión primero entra (o se da de alta) y después vuelve a la
 * invitación. En la web sobrevive a la redirección de Google gracias a sessionStorage; en el móvil basta la memoria.
 */
let pending: string | null = null;
const KEY = 'appinity.pendingInvite';

export function rememberInvite(code: string): void {
  pending = code;
  try {
    globalThis.sessionStorage?.setItem(KEY, code);
  } catch {
    // Sin almacenamiento (vista previa, modo privado): queda en memoria.
  }
}

export function takePendingInvite(): string | null {
  let code = pending;
  try {
    code = code ?? globalThis.sessionStorage?.getItem(KEY) ?? null;
    globalThis.sessionStorage?.removeItem(KEY);
  } catch {
    // Ídem.
  }
  pending = null;
  return code && /^[a-z0-9]{10}$/.test(code) ? code : null;
}

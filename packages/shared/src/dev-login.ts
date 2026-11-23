/**
 * Qué enseña la pantalla de entrada de la app sobre la identidad de desarrollo (usuarios de demo y cuenta local), según
 * la respuesta de `GET /v1/dev/users` (auditoría B10). Un 404 quiere decir que no está disponible para este teléfono:
 * apagada en el servidor (producción) o bloqueada por el túnel de la beta. Entonces un tester solo ve «Continuar con
 * Google», sin el aviso de datos simulados, la lista de demo, el formulario de cuenta local ni un error que no le toca.
 * Cualquier otro fallo (la API no responde) sí se enseña: también impide entrar con Google.
 */
export type DevLoginState = 'loading' | 'available' | 'hidden' | 'error';

export function devLoginState(query: { isSuccess: boolean; isError: boolean; errorStatus?: number | undefined }): DevLoginState {
  if (query.isSuccess) return 'available';
  if (query.isError) return query.errorStatus === 404 ? 'hidden' : 'error';
  return 'loading';
}

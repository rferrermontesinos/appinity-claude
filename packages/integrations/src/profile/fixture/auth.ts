import type { AuthResult, ConnectContext, FixtureSourceKey } from '@appinity/shared';

/**
 * "Conexión" de una fuente simulada. No hay OAuth, credenciales ni redirección: se registra explícitamente
 * como fixture para no simular un éxito de autenticación real.
 */
export async function connectFixture(source: FixtureSourceKey, context: ConnectContext): Promise<AuthResult> {
  return {
    kind: 'connected',
    externalAccountRef: `fixture:${source}:${context.userId.slice(-4)}`,
    scopes: ['fixture:read'],
  };
}

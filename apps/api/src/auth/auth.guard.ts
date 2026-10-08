import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../common/public.decorator.js';
import type { AuthedRequest } from './auth.types.js';
import { DevAuthService, localCodeFingerprint } from './dev-auth.service.js';
import { UsersRepository } from './users.repository.js';

/**
 * Guard global: toda ruta no marcada con @Public() exige una sesión válida de un usuario activo.
 * La autorización por recurso se aplica después en cada servicio (filtrando por userId).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly devAuth: DevAuthService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Falta la sesión');
    if (!this.devAuth.enabled) {
      throw new UnauthorizedException(
        'No hay autenticación disponible: la identidad de desarrollo está desactivada y la de producción aún no existe',
      );
    }

    let userId: string;
    let fingerprint: string | undefined;
    try {
      ({ userId, localCodeFingerprint: fingerprint } = await this.devAuth.verify(header.slice('Bearer '.length).trim()));
    } catch {
      throw new UnauthorizedException('Sesión no válida o caducada');
    }

    const user = await this.users.findActiveById(userId);
    // La identidad de desarrollo solo vale para usuarios simulados o para cuentas locales reales creadas con
    // `pnpm user:local` (con código vigente). Nunca para usuarios reales sin ese consentimiento local explícito.
    const allowed =
      user &&
      (user.dataset === 'demo' ||
        (user.localLoginCodeHash !== null && fingerprint === localCodeFingerprint(user.localLoginCodeHash)));
    if (!user || !allowed) throw new UnauthorizedException('Sesión no válida');

    request.auth = { userId: user.id, dataset: user.dataset, kind: 'dev' };
    return true;
  }
}

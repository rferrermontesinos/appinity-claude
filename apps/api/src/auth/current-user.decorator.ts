import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthContext, AuthedRequest } from './auth.types.js';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new UnauthorizedException('Falta la sesión');
  return auth;
});

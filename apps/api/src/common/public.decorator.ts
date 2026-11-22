import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'appinity:isPublic';

/** Marca una ruta como pública. Todas las demás requieren sesión (guard global). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

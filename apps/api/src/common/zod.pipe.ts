import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';

/** Valida y tipa el cuerpo o los parámetros con un esquema Zod (validación runtime). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Datos de entrada no válidos',
        details: z.flattenError(result.error),
      });
    }
    return result.data;
  }
}

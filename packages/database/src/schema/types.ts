import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

/**
 * Columna geography(Point,4326) generada a partir de latitud/longitud. Las distancias se
 * calculan en metros con ST_DWithin/ST_Distance sobre geography, nunca en grados.
 */
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

export function pointFrom(longitudeColumn: string, latitudeColumn: string) {
  return sql.raw(
    `CASE WHEN ${longitudeColumn} IS NULL OR ${latitudeColumn} IS NULL THEN NULL ` +
      `ELSE ST_SetSRID(ST_MakePoint(${longitudeColumn}, ${latitudeColumn}), 4326)::geography END`,
  );
}

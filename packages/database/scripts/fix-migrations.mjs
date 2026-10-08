// drizzle-kit 0.31 entrecomilla los tipos personalizados con paréntesis ("geography(Point,4326)"),
// lo que PostgreSQL interpreta como un identificador inexistente. Este paso posterior a
// `drizzle-kit generate` quita las comillas de esos tipos PostGIS en las migraciones SQL.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../drizzle/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
  const path = new URL(file, dir);
  const sql = readFileSync(path, 'utf8');
  const fixed = sql.replace(/"(geography|geometry)\(([A-Za-z]+),\s*(\d+)\)"/g, '$1($2,$3)');
  if (fixed !== sql) {
    writeFileSync(path, fixed);
    console.log(`fix-migrations: tipos PostGIS corregidos en ${file}`);
  }
}

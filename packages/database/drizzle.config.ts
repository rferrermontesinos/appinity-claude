import { defineConfig } from 'drizzle-kit';

// `generate` no necesita conexión: compara el esquema TypeScript con las migraciones existentes.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});

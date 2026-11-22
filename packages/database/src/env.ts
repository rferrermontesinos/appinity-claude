export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Ejecuta \`pnpm setup\` y revisa .env.`);
  }
  return value;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' && !isProduction();
}

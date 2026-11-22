import { parseArgs } from 'node:util';
import { createDatabase, requireEnv } from '@appinity/database';
import { createOrResetLocalUser } from '../local-users.js';

// pnpm user:local --handle ricard --name "Ricard" [--country ES]
// pnpm reenvía el separador «--» al script: se descarta antes de analizar las opciones.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { handle: { type: 'string' }, name: { type: 'string' }, country: { type: 'string' } },
});
if (!values.handle || !values.name) {
  console.error('Uso: pnpm user:local --handle <handle> --name "<nombre visible>" [--country ES]');
  process.exit(1);
}
if (process.env.DEV_AUTH_ENABLED !== 'true' || process.env.DEMO_MODE !== 'true') {
  console.error('La cuenta local real solo funciona con DEMO_MODE=true y DEV_AUTH_ENABLED=true (desarrollo).');
  process.exit(1);
}

const handle = createDatabase(requireEnv('DATABASE_URL'), { max: 1, applicationName: 'appinity-claude-local-user' });
try {
  const result = await createOrResetLocalUser(handle.db, {
    handle: values.handle,
    displayName: values.name,
    ...(values.country ? { countryCode: values.country.toUpperCase() } : {}),
  });
  console.log(`✔ Cuenta local real ${result.created ? 'creada' : 'actualizada'}: @${values.handle} (dataset live)`);
  console.log('');
  console.log(`  Código de acceso: ${result.code}`);
  console.log('');
  console.log('  Introdúcelo en la app (pantalla inicial → «Cuenta local real»). Se muestra solo ahora; no lo pegues en');
  console.log('  chats ni lo subas a Git. Si lo pierdes, vuelve a ejecutar este comando para generar otro.');
} finally {
  await handle.close();
}

import { createDatabase, requireEnv } from '@appinity/database';
import { assertDemoSeedAllowed } from '../demo/guard.js';
import { seedDemoUsers } from '../demo/seed-users.js';

assertDemoSeedAllowed();
const handle = createDatabase(requireEnv('DATABASE_URL'), { max: 2, applicationName: 'appinity-claude-seed' });
try {
  const count = await seedDemoUsers(handle.db);
  console.log(`✔ Usuarios simulados: ${count} (dataset demo)`);
} finally {
  await handle.close();
}

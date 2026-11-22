import { requireEnv } from '../env.js';
import { resetDatabase } from '../reset.js';

const url = requireEnv('DATABASE_URL');
await resetDatabase(url);
console.log(`✔ Base de datos vaciada: ${new URL(url).pathname.slice(1)}`);

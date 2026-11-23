import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { createDatabase, type DatabaseHandle } from '@appinity/database';
import { AppModule } from '../app.module.js';
import { AccountService } from '../auth/account.service.js';
import { loadEnv } from '../config/env.js';
import { DATABASE } from '../infra/tokens.js';
import { runAccountDelete, runAccountExport } from './account-commands.js';

// pnpm account:export --email persona@gmail.com [--handle h] [--out ruta.json]
// pnpm account:delete --email persona@gmail.com [--handle h] [--confirm <handle>]
// pnpm reenvía el separador «--» al script: se descarta antes de analizar las opciones.
const [command, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
const { values } = parseArgs({
  args: rest,
  options: { email: { type: 'string' }, handle: { type: 'string' }, out: { type: 'string' }, confirm: { type: 'string' } },
});
const print = (line: string) => console.log(line);

try {
  const env = loadEnv();
  if (command === 'export') {
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: 'appinity-claude-account-export' });
    try {
      await runAccountExport(database.db, values, print);
    } finally {
      await database.close();
    }
  } else if (command === 'delete') {
    // La misma configuración que la API: así se anulan los permisos en los proveedores igual que desde la app.
    const app = await NestFactory.createApplicationContext(AppModule.register(env), { logger: ['error', 'warn'] });
    try {
      await runAccountDelete(app.get<DatabaseHandle>(DATABASE).db, app.get(AccountService), values, print);
    } finally {
      await app.close();
    }
  } else {
    throw new Error('Uso: pnpm account:export | account:delete --email <email> [--handle <handle>] (ver docs/operations.md)');
  }
} catch (error) {
  console.error(`✕ ${(error as Error).message}`);
  process.exitCode = 1;
}

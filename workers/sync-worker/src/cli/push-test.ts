import { parseArgs } from 'node:util';
import { createDatabase, requireEnv, userSettings, users } from '@appinity/database';
import { sendTestPush } from '@appinity/ingestion';
import { ExpoPushSender } from '@appinity/integrations';
import { eq } from 'drizzle-orm';

// pnpm push:test --handle <handle>
// Envía una notificación de prueba a los teléfonos activos de esa persona (fase B6): comprueba Expo, FCM y la app sin
// esperar al resumen de las 19:00. No guarda nada ni cuenta como resumen. EXPO_ACCESS_TOKEN solo si EAS lo exige.
const { values } = parseArgs({ args: process.argv.slice(2).filter((arg) => arg !== '--'), options: { handle: { type: 'string' } } });
const handle = values.handle?.trim().toLowerCase();
if (!handle) {
  console.error('Uso: pnpm push:test --handle <handle>');
  process.exit(1);
}

const database = createDatabase(requireEnv('DATABASE_URL'), { max: 1, applicationName: 'appinity-claude-push-test' });
try {
  const [person] = await database.db
    .select({ id: users.id, locale: userSettings.locale })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.handle, handle));
  if (!person) throw new Error(`No hay ninguna cuenta con el handle ${handle}`);
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  const sender = new ExpoPushSender(accessToken ? { accessToken } : {});
  const { devices, tickets } = await sendTestPush(database.db, sender, person.id, person.locale === 'en' ? 'en' : 'es');
  if (!devices) {
    console.log(`@${handle} no tiene ningún teléfono registrado: abre la app instalada (no Expo Go) y activa las notificaciones en Ajustes.`);
  } else {
    for (const [i, ticket] of tickets.entries()) {
      console.log(
        ticket.status === 'ok'
          ? `✔ Teléfono ${i + 1}: Expo lo aceptó (ticket ${ticket.id})`
          : `✕ Teléfono ${i + 1}: ${ticket.error ?? ''} ${ticket.message}`.trim(),
      );
    }
    console.log('Si no llega en un minuto, revisa la clave de FCM V1 en EAS (docs/operations.md, «Notificaciones push»).');
  }
} catch (error) {
  console.error(`✕ ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await database.close();
}

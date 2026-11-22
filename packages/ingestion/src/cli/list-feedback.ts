import { parseArgs } from 'node:util';
import { createDatabase, requireEnv } from '@appinity/database';
import { countUnreadFeedback, listFeedback, markFeedbackRead } from '../feedback.js';

// pnpm feedback:list [--all] [--limit 50] [--mark-read]
// Comentarios de la beta (fase B5), los más recientes primero. Por defecto, solo los no leídos.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { all: { type: 'boolean' }, limit: { type: 'string' }, 'mark-read': { type: 'boolean' } },
});
const limit = values.limit ? Number(values.limit) : 50;
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  console.error('Uso: pnpm feedback:list [--all] [--limit 1-500] [--mark-read]');
  process.exit(1);
}

const handle = createDatabase(requireEnv('DATABASE_URL'), { max: 1, applicationName: 'appinity-claude-feedback' });
try {
  const entries = await listFeedback(handle.db, { includeRead: values.all ?? false, limit });
  const unread = await countUnreadFeedback(handle.db);
  if (!entries.length) {
    console.log(values.all ? 'No hay ningún comentario.' : 'No hay comentarios sin leer (--all para ver también los leídos).');
  } else {
    console.log(`${entries.length} comentario(s) · ${unread} sin leer en total\n`);
    for (const entry of entries) {
      const when = entry.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      const who = `@${entry.handle}${entry.displayName ? ` (${entry.displayName})` : ''}${entry.dataset === 'demo' ? ' · demo' : ''}`;
      const read = entry.readAt ? ' · leído' : '';
      console.log(`${when} UTC · ${who} · ${entry.platform} ${entry.appVersion}${read}`);
      for (const line of entry.message.split('\n')) console.log(`  ${line}`);
      console.log('');
    }
  }
  if (values['mark-read']) {
    const marked = await markFeedbackRead(
      handle.db,
      entries.filter((e) => !e.readAt).map((e) => e.id),
    );
    console.log(`✔ ${marked} comentario(s) marcados como leídos.`);
  }
} finally {
  await handle.close();
}

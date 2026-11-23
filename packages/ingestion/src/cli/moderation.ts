import { parseArgs } from 'node:util';
import { createDatabase, requireEnv } from '@appinity/database';
import { ConflictError, NotFoundError } from '../errors.js';
import { countPendingReports, findModerationTarget, listReports, markReportsReviewed, suspendUser, unsuspendUser } from '../moderation.js';

// Moderación de la beta (fase B9). Ver docs/operations.md («Moderación») y docs/incidencias.md.
//   pnpm reports:list [--all] [--limit 50] [--mark-reviewed]   reportes pendientes, agrupados por persona
//   pnpm account:suspend --handle <h> [--confirm <h>]           sin --confirm enseña la cuenta; con él la suspende
//   pnpm account:unsuspend --handle <h> --confirm <h>           levanta la suspensión
const [command, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
const { values } = parseArgs({
  args: rest,
  options: {
    all: { type: 'boolean' },
    limit: { type: 'string' },
    'mark-reviewed': { type: 'boolean' },
    handle: { type: 'string' },
    confirm: { type: 'string' },
  },
});

const REASONS = { spam: 'spam', harassment: 'acoso', inappropriate: 'contenido inapropiado', impersonation: 'suplantación', other: 'otro' } as const;
const STATUS = { active: 'activa', suspended: 'suspendida', deleted: 'eliminada' } as const;
const when = (date: Date) => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const usage = () => {
  console.error('Uso: pnpm reports:list [--all] [--limit 1-500] [--mark-reviewed]');
  console.error('     pnpm account:suspend --handle <h> [--confirm <h>]');
  console.error('     pnpm account:unsuspend --handle <h> --confirm <h>');
  process.exit(1);
};

if (command !== 'list' && command !== 'suspend' && command !== 'unsuspend') usage();
const limit = values.limit ? Number(values.limit) : 50;
if (!Number.isInteger(limit) || limit < 1 || limit > 500) usage();
if (command !== 'list' && !values.handle) usage();

const database = createDatabase(requireEnv('DATABASE_URL'), { max: 1, applicationName: 'appinity-claude-moderation' });
try {
  if (command === 'list') {
    const people = await listReports(database.db, { includeReviewed: values.all ?? false, limit });
    const pending = await countPendingReports(database.db);
    if (!people.length) {
      console.log(values.all ? 'No hay ningún reporte.' : 'No hay reportes pendientes (--all para ver también los revisados).');
    } else {
      const reports = people.reduce((n, p) => n + p.reports.length, 0);
      console.log(`${reports} reporte(s) sobre ${people.length} persona(s) · ${pending} pendiente(s) en total\n`);
      for (const person of people) {
        const status = person.status === 'suspended' && person.suspendedAt ? `suspendida desde ${when(person.suspendedAt)}` : STATUS[person.status];
        console.log(`@${person.handle}${person.displayName ? ` (${person.displayName})` : ''} · ${person.dataset} · ${status}`);
        for (const report of person.reports) {
          const reviewed = report.reviewedAt ? ' · revisado' : '';
          console.log(`  ${when(report.createdAt)} · ${REASONS[report.reason]} · de @${report.reporterHandle}${reviewed}`);
          if (report.note) for (const line of report.note.split('\n')) console.log(`    «${line}»`);
        }
        if (person.status === 'active') console.log(`  → para suspenderla: pnpm account:suspend --handle ${person.handle}`);
        console.log('');
      }
    }
    if (values['mark-reviewed']) {
      const ids = people.flatMap((p) => p.reports.filter((r) => !r.reviewedAt).map((r) => r.id));
      console.log(`✔ ${await markReportsReviewed(database.db, ids)} reporte(s) marcados como revisados.`);
    }
  } else {
    const target = await findModerationTarget(database.db, values.handle!);
    const name = `@${target.handle}${target.displayName ? ` (${target.displayName})` : ''}`;
    console.log(`${name} · ${target.dataset} · ${STATUS[target.status]} · ${target.pendingReports} reporte(s) pendiente(s)`);
    if (values.confirm === undefined) {
      if (command === 'unsuspend') usage();
      console.log(`No se ha cambiado nada. Para suspenderla: pnpm account:suspend --handle ${target.handle} --confirm ${target.handle}`);
    } else if (values.confirm !== target.handle) {
      console.error(`--confirm tiene que ser el handle de la cuenta (${target.handle}). No se ha cambiado nada.`);
      process.exitCode = 1;
    } else if (command === 'suspend') {
      const { sessionsRevoked } = await suspendUser(database.db, target.userId);
      console.log(`✔ ${name} suspendida: ${sessionsRevoked} sesión(es) cerrada(s). Ya no puede entrar y no aparece para nadie.`);
      console.log('  Escríbele explicando el motivo y cómo pedir una revisión (docs/incidencias.md).');
    } else {
      await unsuspendUser(database.db, target.userId);
      console.log(`✔ Suspensión levantada: ${name} puede volver a entrar con Google.`);
    }
  }
} catch (error) {
  if (error instanceof NotFoundError || error instanceof ConflictError) {
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  } else throw error;
} finally {
  await database.close();
}

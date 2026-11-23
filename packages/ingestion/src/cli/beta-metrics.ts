import { parseArgs } from 'node:util';
import { createDatabase, requireEnv } from '@appinity/database';
import { betaMetrics, HOME_BATCH, type Ratio } from '../beta-metrics.js';

// pnpm beta:metrics [--since 2026-12-01] [--dataset live|demo] [--json]
// Métricas de la beta (fase B9), sin terceros: solo recuentos sacados de la base de datos. --since: personas dadas de
// alta desde esa fecha (el inicio de una ola). --dataset demo: para probar el comando con la demo.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { since: { type: 'string' }, dataset: { type: 'string' }, json: { type: 'boolean' } },
});
const since = values.since ? new Date(`${values.since}T00:00:00Z`) : undefined;
const dataset = values.dataset ?? 'live';
if ((since && Number.isNaN(since.getTime())) || (dataset !== 'live' && dataset !== 'demo')) {
  console.error('Uso: pnpm beta:metrics [--since AAAA-MM-DD] [--dataset live|demo] [--json]');
  process.exit(1);
}

const pct = (r: Ratio) => (r.of ? `${Math.round((r.count / r.of) * 100)} %` : '—');
const ratio = (r: Ratio) => `${r.count} de ${r.of} (${pct(r)})`;
/** ✔ o ✕ frente al objetivo de la ola; nada si aún no hay a quién medir. */
const goal = (r: Ratio, target: number) => (r.of ? (r.count / r.of >= target ? ' ✔' : ' ✕') : '');
const decimal = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }));

const database = createDatabase(requireEnv('DATABASE_URL'), { max: 1, applicationName: 'appinity-claude-metrics' });
try {
  const m = await betaMetrics(database.db, { dataset, ...(since ? { since } : {}) });
  if (values.json) {
    console.log(JSON.stringify(m, null, 2));
  } else {
    const cards = m.wave2.homeCards;
    const share = (n: number) => ratio({ count: n, of: cards.total });
    console.log(
      `Métricas de la beta · ${m.dataset}${m.since ? ` · altas desde ${m.since.slice(0, 10)}` : ''} · ${m.generatedAt.slice(0, 16).replace('T', ' ')} UTC`,
    );
    console.log('Sin terceros: todo sale de la base de datos y son solo recuentos.\n');
    console.log(
      `Personas: ${m.people.accounts} cuenta(s) · alta completa ${ratio({ count: m.people.onboarded, of: m.people.accounts })} · suspendidas ${m.people.suspended}\n`,
    );

    console.log('Ola 1 · Alfa (objetivo: todas completan el alta y ven gustos importados en menos de 24 h)');
    console.log(
      `  Gustos importados de alguna fuente: ${ratio(m.wave1.importedTastes)} · en menos de 24 h: ${ratio(m.wave1.importedWithin24h)}${goal(m.wave1.importedWithin24h, 1)}`,
    );
    console.log(`  Horas hasta la primera importación (mediana): ${decimal(m.wave1.medianHoursToFirstImport)}`);
    console.log(`  Han votado en la app: ${ratio(m.wave1.votedInApp)}\n`);

    console.log('Ola 2 · Beta cerrada (objetivos: ≥ 50 % con un alma gemela en 48 h · ≥ 30 % de tarjetas de consenso o descubrimiento)');
    console.log(
      `  Con alma gemela, de quienes llevan 48 h o más: ${ratio(m.wave2.soulmateAfter48h)}${goal(m.wave2.soulmateAfter48h, 0.5)} (ahora, no a las 48 h exactas)`,
    );
    console.log(
      `  Primera tanda de Inicio (${HOME_BATCH} por persona, calculada ahora): consenso y descubrimiento ${share(cards.personal)}` +
        `${goal({ count: cards.personal, of: cards.total }, 0.3)} · Trending ${share(cards.trending)} · relleno ${share(cards.fallback)}`,
    );
    console.log(
      `  Votos por persona y día con votos: ${decimal(m.wave2.votesPerActiveDay.last7)} (los 7 días anteriores: ${decimal(m.wave2.votesPerActiveDay.previous7)})\n`,
    );

    console.log('Ola 3 · Beta ampliada (objetivo: retención a 7 días ≥ 30 % y Trending activo)');
    console.log(
      `  Vuelven entre el día 7 y el 13 tras el alta: ${ratio(m.wave3.retainedDay7)}${goal(m.wave3.retainedDay7, 0.3)} (aproximado, por la actividad que deja huella)`,
    );
    console.log(`  Con Trending en su Inicio: ${ratio(m.wave3.withTrending)} · con zona: ${ratio(m.wave3.withLocation)}`);
    console.log(`  Resumen push entregado en los últimos 7 días: a ${m.wave3.pushReachedLast7} persona(s)\n`);

    console.log(`Pendiente de revisar: ${m.pending.reports} reporte(s) (pnpm reports:list) · ${m.pending.feedback} comentario(s) (pnpm feedback:list)`);
  }
} finally {
  await database.close();
}

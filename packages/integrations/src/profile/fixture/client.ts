import type { FixtureSourceKey } from '@appinity/shared';
import activity from './fixtures/activity.json' with { type: 'json' };
import audio from './fixtures/audio.json' with { type: 'json' };
import diary from './fixtures/diary.json' with { type: 'json' };
import play from './fixtures/play.json' with { type: 'json' };
import screen from './fixtures/screen.json' with { type: 'json' };
import { personaRecords } from './personas.js';
import { fixtureFileSchema, type FixtureFile } from './schemas.js';

const FILES: Record<FixtureSourceKey, unknown> = {
  fixture_screen: screen,
  fixture_diary: diary,
  fixture_activity: activity,
  fixture_play: play,
  fixture_audio: audio,
};

/**
 * "Cliente" de la fuente simulada: equivale al cliente HTTP de una fuente real. Lee los registros en bruto de
 * un usuario simulado desde archivos versionados; nunca llama a un proveedor.
 */
export class FixtureClient {
  private readonly file: FixtureFile;

  constructor(readonly source: FixtureSourceKey) {
    this.file = fixtureFileSchema.parse(FILES[source]);
  }

  /**
   * Registros del usuario (vacío si el usuario simulado no tiene actividad en esta fuente). Las personas sintéticas de
   * la fase 6 derivan los suyos de los de otra persona de demo (personas.ts).
   */
  recordsFor(userId: string): unknown[] {
    const own = this.file.users.find((u) => u.userId === userId)?.records;
    return own ?? personaRecords(this.source, userId, (from) => this.file.users.find((u) => u.userId === from)?.records ?? []);
  }

  /** Página de registros por desplazamiento, para simular paginación con cursor persistido. */
  page(userId: string, offset: number, limit: number): { records: unknown[]; total: number } {
    const all = this.recordsFor(userId);
    return { records: all.slice(offset, offset + limit), total: all.length };
  }
}

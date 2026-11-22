import { percentile } from '@appinity/algorithms';
import type { FixtureSourceKey, SyncBatch, SyncContext } from '@appinity/shared';
import type { FixtureClient } from './client.js';
import { audioRecordSchema, playRecordSchema, type AudioRecord } from './schemas.js';

/** Fuentes de eventos: se paginan y el cursor (desplazamiento) avanza tras cada sync correcto. */
const EVENT_SOURCES = new Set<FixtureSourceKey>(['fixture_screen', 'fixture_diary', 'fixture_activity']);

function maxInstant(records: unknown[]): string | undefined {
  const dates = records
    .map((r) => (r as { at?: unknown; date?: unknown }).at ?? (r as { date?: unknown }).date)
    .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(d))
    .sort();
  return dates.at(-1);
}

export async function syncFixture(client: FixtureClient, context: SyncContext): Promise<SyncBatch> {
  const userId = context.connection.userId;

  if (EVENT_SOURCES.has(client.source)) {
    const offset = typeof context.cursor?.offset === 'number' ? context.cursor.offset : 0;
    const { records, total } = client.page(userId, offset, context.pageSize);
    const next = offset + records.length;
    const watermark = maxInstant(records);
    return {
      records,
      cursor: { offset: next },
      hasMore: next < total,
      ...(watermark ? { watermarkAt: watermark } : {}),
      partialErrors: [],
      snapshotComplete: false,
    };
  }

  // Instantáneas (biblioteca de juegos, escuchas): se entregan completas en cada sync.
  const all = client.recordsFor(userId);
  if (client.source === 'fixture_play') {
    const hours = all
      .map((r) => playRecordSchema.safeParse(r))
      .filter((r) => r.success && r.data.playtime_forever > 0)
      .map((r) => r.data!.playtime_forever / 60);
    const p95 = percentile(hours, 0.95);
    return {
      records: all,
      cursor: null,
      hasMore: false,
      partialErrors: [],
      snapshotComplete: true,
      ...(p95 !== null ? { stats: { playtimeP95Hours: p95 } } : {}),
    };
  }

  // Audio: agrega episodios por programa (la entidad recomendada es el programa, no el episodio).
  const passthrough: unknown[] = [];
  const shows = new Map<string, { show: { name: string; appleId: string }; episodeIds: string[]; lastPlayedAt: string | null }>();
  const playcounts: number[] = [];
  for (const raw of all) {
    const parsed = audioRecordSchema.safeParse(raw);
    if (!parsed.success) {
      passthrough.push(raw); // El mapper lo rechazará y quedará como error parcial.
      continue;
    }
    const record: AudioRecord = parsed.data;
    if (record.kind === 'podcast_episode') {
      const entry = shows.get(record.show.appleId) ?? { show: record.show, episodeIds: [], lastPlayedAt: null };
      if (!entry.episodeIds.includes(record.id)) entry.episodeIds.push(record.id);
      if (!entry.lastPlayedAt || record.at > entry.lastPlayedAt) entry.lastPlayedAt = record.at;
      shows.set(record.show.appleId, entry);
      continue;
    }
    if (record.kind === 'artist_playcount' && record.playcount > 0) playcounts.push(record.playcount);
    passthrough.push(raw);
  }
  const aggregated = [...shows.values()].map((s) => ({
    kind: 'show_listening' as const,
    show: s.show,
    episodesPlayed: s.episodeIds.length,
    episodeIds: s.episodeIds.sort(),
    lastPlayedAt: s.lastPlayedAt,
  }));
  const artistP95 = percentile(playcounts, 0.95);
  const showP95 = percentile(aggregated.map((a) => a.episodesPlayed), 0.95);
  return {
    records: [...passthrough, ...aggregated],
    cursor: null,
    hasMore: false,
    partialErrors: [],
    snapshotComplete: true,
    stats: {
      ...(artistP95 !== null ? { artistPlaycountP95: artistP95 } : {}),
      ...(showP95 !== null ? { showEpisodesP95: showP95 } : {}),
    },
  };
}

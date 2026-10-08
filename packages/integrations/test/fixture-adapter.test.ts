import {
  FIXTURE_SOURCE_KEYS,
  parseObservation,
  type NormalizeContext,
  type NormalizedObservation,
  type SyncBatch,
  type UserConnection,
} from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { createFixtureAdapter } from '../src/profile/fixture/index.js';
import {
  mapActivityRecord,
  mapAudioRecord,
  mapDiaryRecord,
  mapPlayRecord,
  mapScreenRecord,
  partialDate,
} from '../src/profile/fixture/mapper.js';
import { createAdapterRegistry } from '../src/registry.js';

const LAURA = '00000000-0000-4000-a000-000000000001';
const ALEX = '00000000-0000-4000-a000-000000000002';
const NURIA = '00000000-0000-4000-a000-000000000005';

const ctx = (userId = LAURA, stats?: Record<string, number>): NormalizeContext => ({
  userId,
  connectionId: '11111111-1111-4111-8111-111111111111',
  source: 'fixture_screen',
  ...(stats ? { stats } : {}),
});

const connection = (userId: string, sourceKey: (typeof FIXTURE_SOURCE_KEYS)[number]): UserConnection => ({
  id: '22222222-2222-4222-8222-222222222222',
  userId,
  sourceKey,
  status: 'active',
  cursor: null,
});

async function syncAll(source: (typeof FIXTURE_SOURCE_KEYS)[number], userId: string) {
  const adapter = createFixtureAdapter(source);
  const batches: SyncBatch[] = [];
  let cursor: SyncBatch['cursor'] = null;
  do {
    const batch = await adapter.sync({ connection: connection(userId, source), cursor, pageSize: 4, now: new Date('2026-10-08T12:00:00Z') });
    batches.push(batch);
    cursor = batch.cursor;
    if (!batch.hasMore) break;
  } while (batches.length < 50);
  const observations: NormalizedObservation[] = [];
  const errors: string[] = [];
  for (const batch of batches) {
    for (const record of batch.records) {
      try {
        const mapped = await adapter.normalize(record, { ...ctx(userId), source, ...(batch.stats ? { stats: batch.stats } : {}) });
        observations.push(...mapped.map((o) => parseObservation(o)));
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
  }
  return { batches, observations, errors };
}

describe('mapper fixture_screen (clase TMDb)', () => {
  it('valoración 1–10 normalizada con la fórmula de la especificación', () => {
    const [o] = mapScreenRecord(
      { id: 'x', type: 'rating', media: { kind: 'movie', tmdbId: 289, imdbId: 'tt0034583', title: 'Casablanca', year: 1942 }, rating: 9, at: '2026-03-14T21:40:00Z' },
      ctx(),
    );
    expect(o).toMatchObject({
      sourceRecordId: 'movie:289',
      observationKind: 'rating',
      category: 'movies',
      knownConfidence: 1,
      consumedConfidence: 1,
      preferenceBasis: 'explicit_rating',
      occurredAt: '2026-03-14T21:40:00Z',
      timestampPrecision: 'instant',
    });
    expect(o!.preferenceScore).toBeCloseTo((9 - 5.5) / 4.5, 4);
    expect(o!.externalItem.canonicalIds).toEqual({ 'tmdb:movie': '289', 'imdb:title': 'tt0034583' });
  });

  it('watchlist y visto sin valoración no inventan gustos', () => {
    const media = { kind: 'movie', tmdbId: 935, title: 'Dr. Strangelove' };
    const [watchlist] = mapScreenRecord({ id: 'a', type: 'watchlist', media, at: null }, ctx());
    const [watched] = mapScreenRecord({ id: 'b', type: 'watched', media, at: null }, ctx());
    expect(watchlist).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null, preferenceConfidence: null, preferenceBasis: null });
    expect(watched).toMatchObject({ knownConfidence: 1, consumedConfidence: 1, preferenceScore: null });
    expect(watchlist!.occurredAt).toBeUndefined();
    expect(watchlist!.timestampPrecision).toBeUndefined();
  });

  it('separa los IDs numéricos de películas y series del mismo proveedor', () => {
    const [movie] = mapScreenRecord({ id: 'm', type: 'watched', media: { kind: 'movie', tmdbId: 1396, title: 'X' }, at: null }, ctx());
    const [tv] = mapScreenRecord({ id: 't', type: 'watched', media: { kind: 'tv', tmdbId: 1396, title: 'Breaking Bad' }, at: null }, ctx());
    expect(Object.keys(movie!.externalItem.canonicalIds!)).toEqual(['tmdb:movie']);
    expect(Object.keys(tv!.externalItem.canonicalIds!)).toEqual(['tmdb:tv']);
    expect(movie!.sourceRecordId).not.toBe(tv!.sourceRecordId);
  });

  it('rechaza en runtime una valoración fuera de escala', () => {
    expect(() =>
      mapScreenRecord({ id: 'z', type: 'rating', media: { kind: 'movie', tmdbId: 1, title: 'X' }, rating: 11, at: null }, ctx()),
    ).toThrow();
  });
});

describe('mapper fixture_diary', () => {
  it('usa la escala real de 0,5 a 5 estrellas', () => {
    const [o] = mapDiaryRecord({ entryId: 'd', kind: 'book', ref: { isbn13: '9780141439471', title: 'Frankenstein' }, status: 'rated', stars: 2, date: '2026-06-03' }, ctx());
    expect(o!.preferenceScore).toBeCloseTo(-0.3333, 4);
    expect(o!.externalItem.canonicalIds).toEqual({ 'isbn:isbn13': '9780141439471' });
  });

  it('conserva la precisión real de la fecha (solo año) y admite fechas ausentes', () => {
    expect(partialDate('2019')).toEqual({ at: '2019-01-01T00:00:00.000Z', precision: 'year' });
    expect(partialDate('2025-11-02')).toEqual({ at: '2025-11-02T00:00:00.000Z', precision: 'day' });
    const [logged] = mapDiaryRecord({ entryId: 'e', kind: 'book', ref: { title: 'La Regenta', year: 1884 }, status: 'logged', date: '2019' }, ctx());
    expect(logged).toMatchObject({ timestampPrecision: 'year', consumedConfidence: 1, preferenceScore: null });
    const [want] = mapDiaryRecord({ entryId: 'f', kind: 'book', ref: { title: 'Don Quijote' }, status: 'want', date: null }, ctx());
    expect(want).toMatchObject({ consumedConfidence: 0, preferenceScore: null });
    expect(want!.occurredAt).toBeUndefined();
  });
});

describe('mapper fixture_activity (clase Google)', () => {
  const entity = { wikidataId: 'Q1067140', name: 'MACBA' };
  it('guardado = solo conocimiento; reseña = valoración explícita', () => {
    const [saved] = mapActivityRecord({ activityId: '1', category: 'food', entity, action: 'saved', at: null }, ctx());
    const [review] = mapActivityRecord({ activityId: '2', category: 'culture', entity, action: 'review', stars: 2, at: '2026-05-11T09:00:00Z' }, ctx());
    expect(saved).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null });
    expect(review).toMatchObject({ preferenceScore: -0.5, preferenceBasis: 'explicit_rating', preferenceConfidence: 1 });
  });

  it('asistencia y visita: +1 por regla de producto con menor confianza que una valoración', () => {
    const [attended] = mapActivityRecord({ activityId: '3', category: 'culture', entity, action: 'attended', at: '2026-05-10T11:00:00Z' }, ctx());
    const [visit] = mapActivityRecord({ activityId: '4', category: 'food', entity, action: 'visit', at: '2026-05-10T11:00:00Z' }, ctx());
    expect(attended).toMatchObject({ consumedConfidence: 1, preferenceScore: 1, preferenceBasis: 'attendance' });
    expect(attended!.preferenceConfidence!).toBeLessThan(1);
    expect(visit!.preferenceBasis).toBe('attendance');
  });

  it('un evento de calendario no prueba asistencia ni gusto', () => {
    const [planned] = mapActivityRecord({ activityId: '5', category: 'culture', entity, action: 'calendar_event', at: '2026-11-20T19:00:00Z' }, ctx());
    expect(planned).toMatchObject({ knownConfidence: 0.8, consumedConfidence: 0, preferenceScore: null });
    expect(planned!.consumedConfidence).toBeLessThan(1);
  });
});

describe('mapper fixture_play (clase Steam)', () => {
  it('juego comprado con 0 horas: conocido, no consumido, preferencia NULL', () => {
    const [o] = mapPlayRecord({ appid: 1127400, name: 'Mindustry', playtime_forever: 0, rtime_last_played: 0 }, ctx());
    expect(o).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null, observationKind: 'library' });
    expect(o!.engagement).toEqual({ type: 'owned', value: 0, unit: 'hours' });
  });

  it('pocas horas: consumido sin preferencia; muchas horas: preferencia positiva inferida', () => {
    const [few] = mapPlayRecord({ appid: 367520, name: 'Hollow Knight', playtime_forever: 45 }, ctx(LAURA, { playtimeP95Hours: 20 }));
    const [many] = mapPlayRecord({ appid: 504230, name: 'Celeste', playtime_forever: 1260 }, ctx(LAURA, { playtimeP95Hours: 20 }));
    expect(few).toMatchObject({ consumedConfidence: 1, preferenceScore: null });
    expect(many).toMatchObject({ consumedConfidence: 1, preferenceBasis: 'strong_behavior' });
    expect(many!.preferenceScore!).toBeGreaterThan(0);
    expect(many!.preferenceConfidence!).toBeLessThan(1);
  });
});

describe('mapper fixture_audio (clase Last.fm)', () => {
  const artist = { name: 'Joan Manuel Serrat', mbid: '64e96700-d880-452e-803d-e4d7628b0224' };
  it('una escucha aislada confirma consumo pero no gusto', () => {
    const [o] = mapAudioRecord({ kind: 'artist_playcount', artist, playcount: 1 }, ctx(LAURA, { artistPlaycountP95: 400 }));
    expect(o).toMatchObject({ consumedConfidence: 1, preferenceScore: null, category: 'music' });
    expect(o!.externalItem.itemType).toBe('artist');
  });

  it('una canción favorita se agrega al artista conservando el alcance', () => {
    const [o] = mapAudioRecord({ kind: 'loved_track', id: 'lt', artist, track: { name: 'Mediterráneo' }, at: '2026-01-01T00:00:00Z' }, ctx());
    expect(o!.externalItem).toMatchObject({ itemType: 'artist', canonicalIds: { 'musicbrainz:artist': artist.mbid } });
    expect(o!.metadata).toMatchObject({ track: 'Mediterráneo', scope: 'track', aggregatedTo: 'artist' });
    expect(o!.preferenceBasis).toBe('explicit_like');
  });

  it('seguir un programa no demuestra haberlo escuchado', () => {
    const [o] = mapAudioRecord({ kind: 'podcast_subscription', show: { name: 'The Daily', appleId: '1200361736' }, at: null }, ctx());
    expect(o).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null, category: 'podcasts' });
  });
});

describe('sync de fuentes fixture', () => {
  it('pagina las fuentes de eventos y el cursor avanza hasta el final', async () => {
    const { batches } = await syncAll('fixture_screen', LAURA);
    expect(batches.length).toBe(3); // 10 registros en páginas de 4
    expect(batches.at(-1)!.cursor).toEqual({ offset: 10 });
    expect(batches.every((b) => !b.snapshotComplete)).toBe(true);
  });

  it('las instantáneas se entregan completas con estadísticas del propio usuario', async () => {
    const { batches } = await syncAll('fixture_play', ALEX);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.snapshotComplete).toBe(true);
    expect(batches[0]!.stats?.playtimeP95Hours).toBeGreaterThan(0);
  });

  it('agrega los episodios por programa', async () => {
    const { observations } = await syncAll('fixture_audio', NURIA);
    const listening = observations.filter((o) => o.observationKind === 'listening');
    expect(listening.map((o) => o.externalItem.title).sort()).toEqual(['Crims', 'Radiolab', 'Serial', 'This American Life']);
    const serial = listening.find((o) => o.externalItem.title === 'Serial')!;
    expect(serial.engagement).toEqual({ type: 'listened', value: 5, unit: 'episodes' });
    expect(observations.some((o) => o.observationKind === 'podcast_episode')).toBe(false);
  });

  it('todas las observaciones de todos los usuarios cumplen el contrato; solo falla el registro inválido a propósito', async () => {
    const users = [LAURA, ALEX, '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004', NURIA];
    let total = 0;
    const errors: string[] = [];
    for (const source of FIXTURE_SOURCE_KEYS) {
      for (const user of users) {
        const result = await syncAll(source, user);
        total += result.observations.length;
        errors.push(...result.errors);
      }
    }
    expect(total).toBeGreaterThan(60);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/rating|10|Too big/i);
  });
});

describe('registro de adapters', () => {
  it('sin DEMO_MODE no hay fuentes fixture y, sin configuración, ninguna real es conectable', () => {
    const registry = createAdapterRegistry({ demoMode: false });
    expect(registry.adapters()).toHaveLength(0);
    expect(registry.get('fixture_screen')).toBeUndefined();
    expect(registry.manifests().every((m) => !m.connectable && ['planned', 'unconfigured'].includes(m.availability))).toBe(true);
    expect(registry.manifests().find((m) => m.key === 'steam')!.authentication).toBe('openid');
  });

  it('con DEMO_MODE registra las cinco fuentes simuladas, identificadas como tales', () => {
    const registry = createAdapterRegistry({ demoMode: true });
    expect(registry.adapters().map((a) => a.manifest.key).sort()).toEqual([...FIXTURE_SOURCE_KEYS].sort());
    for (const adapter of registry.adapters()) {
      expect(adapter.manifest).toMatchObject({ simulated: true, availability: 'fixture', authentication: 'fixture' });
    }
  });

  it('las fuentes previstas no declaran capacidades no verificadas', () => {
    const planned = createAdapterRegistry({ demoMode: true }).manifests().filter((m) => m.availability === 'planned');
    expect(planned.length).toBeGreaterThan(0);
    for (const m of planned) expect(Object.values(m.capabilities).every((v) => v === false)).toBe(true);
  });
});

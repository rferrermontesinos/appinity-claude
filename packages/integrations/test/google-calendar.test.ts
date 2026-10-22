import { parseObservation, type IdentifiedEntity, type SyncContext } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { calendarCandidates, createGoogleCalendarAdapter, googleCalendarConnection, mapCalendar, type CalendarEvent } from '../src/profile/google-calendar/index.js';
import { googleBooksConnection } from '../src/profile/google-books/index.js';

/** Google y el catálogo SIMULADOS: nada sale a la red. */
const USER = '10000000-0000-4000-a000-0000000000c2';
const ev = (summary: string, location: string | undefined, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `${summary}${date}`,
  summary,
  ...(location ? { location } : {}),
  start: { dateTime: date },
  eventType: 'default',
  ...extra,
});
const place = (title: string, category: 'food' | 'culture'): IdentifiedEntity => ({ category, itemType: category === 'food' ? 'restaurant' : 'venue', title, canonicalIds: { 'osm:node': title.length.toString() }, confidence: 0.855, method: 'geocodificado_osm' });

describe('Google Calendar · candidatos', () => {
  it('lugar con nombre, conciertos y películas con prefijo; ignora en línea, privados, direcciones, cancelados y cumpleaños', () => {
    const c = calendarCandidates([
      ev('Cena', 'Casa Lucio, Calle de la Cava Baja, 35, Madrid', '2026-03-14T21:00:00+01:00'),
      ev('Concierto: Rosalía', undefined, '2026-07-10T21:00:00+02:00'),
      ev('Coldplay en concierto', undefined, '2025-06-20T21:00:00+02:00'),
      ev('Cine: Oppenheimer', undefined, '2025-08-01T22:00:00+02:00'),
      ev('Reunión', 'Zoom https://zoom.us/j/1', '2026-05-05T10:00:00+02:00'),
      ev('Médico', 'Calle de Alcalá, 100, Madrid', '2026-05-06T10:00:00+02:00'),
      ev('Trabajo', 'Oficina', '2026-05-07T09:00:00+02:00'),
      ev('Museo', 'Museo Reina Sofía, Madrid', '2026-05-08T10:00:00+02:00', { status: 'cancelled' }),
      ev('Cumpleaños', 'Teatro Real', '2026-05-09T00:00:00Z', { eventType: 'birthday' }),
      ev('Café con Marta', undefined, '2026-05-10T10:00:00+02:00'),
    ]);
    expect(c).toEqual([
      { kind: 'place', name: 'Casa Lucio', address: 'Calle de la Cava Baja, 35, Madrid', date: '2026-03-14T21:00:00+01:00' },
      { kind: 'artist', name: 'Rosalía', date: '2026-07-10T21:00:00+02:00' },
      { kind: 'artist', name: 'Coldplay', date: '2025-06-20T21:00:00+02:00' },
      { kind: 'movie', title: 'Oppenheimer', date: '2025-08-01T22:00:00+02:00' },
    ]);
  });

  it('semántica §6: un evento es intención — conocido 0,8 × confianza, consumido 0, preferencia NULL', () => {
    const o = parseObservation(
      mapCalendar({ recordId: 'food:osm:node:1', identified: place('Casa Lucio', 'food'), events: 2, date: '2026-06-01T21:30:00+02:00', upcoming: false }, { userId: USER, connectionId: USER, source: 'google_calendar' })[0]!,
    );
    expect(o).toMatchObject({ knownConfidence: 0.684, consumedConfidence: 0, preferenceScore: null, preferenceBasis: null, engagement: { type: 'saved', value: 2 } });
  });
});

describe('Google Calendar · sync', () => {
  it('pide solo los campos necesarios, agrupa por objeto y no guarda títulos de eventos', async () => {
    const urls: string[] = [];
    const items = [
      ev('Cena cumple Ana', 'Casa Lucio, Cava Baja 35, Madrid', '2026-03-14T21:00:00+01:00'),
      ev('Reserva en Casa Lucio', 'Casa Lucio, Cava Baja 35, Madrid', '2026-06-01T21:30:00+02:00', { eventType: 'fromGmail' }),
      ev('Ópera', 'Teatro Real, Plaza de Isabel II, Madrid', '2026-11-20T20:00:00+01:00'),
      ev('Concierto: Grupo Inventado', undefined, '2026-01-01T21:00:00+01:00'),
    ];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = input.toString();
      urls.push(url);
      if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'acceso', expires_in: 3600 }));
      return new Response(JSON.stringify({ items }));
    }) as typeof fetch;
    const identifier = {
      identifyPlacesByText: async (places: Array<{ name: string }>) => places.map((p) => ({ entity: p.name === 'Casa Lucio' ? place('Casa Lucio', 'food') : place('Teatro Real', 'culture') })),
      identifyArtists: async (names: string[]) => names.map(() => ({ entity: null, reason: 'no_match' })),
      identifyWork: async () => null,
    } as unknown as Parameters<typeof createGoogleCalendarAdapter>[0]['identifier'];
    const adapter = createGoogleCalendarAdapter({ clientId: 'c', clientSecret: 's', fetchImpl, identifier, now: () => new Date('2026-10-22T12:00:00Z') });
    const batch = await adapter.sync({ credentials: { refreshToken: 'r', sharedGrant: '1' } } as unknown as SyncContext);
    const api = new URL(urls.find((u) => u.includes('/calendar/v3/'))!);
    expect(api.searchParams.get('fields')).toBe('items(id,status,summary,location,eventType,start),nextPageToken');
    expect(api.searchParams.getAll('eventTypes')).toEqual(['default', 'fromGmail']);
    expect(batch.records).toHaveLength(2);
    expect(batch.records).toContainEqual(expect.objectContaining({ events: 2, upcoming: false, date: '2026-06-01T21:30:00+02:00' }));
    expect(batch.records).toContainEqual(expect.objectContaining({ events: 1, upcoming: true }));
    expect(JSON.stringify(batch.records)).not.toMatch(/Cena cumple|Reserva en|Ópera|Inventado/);
    expect(batch.partialErrors).toEqual([expect.objectContaining({ code: 'unidentified', blocking: false })]);
  });

  it('no hay conexión aparte: el calendario se concede al entrar con Google', async () => {
    const adapter = createGoogleCalendarAdapter({ clientId: 'c', clientSecret: 's' });
    await expect(adapter.connect({ userId: USER, redirectUri: 'x', state: 's' })).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('el permiso compartido del alta no se revoca al desconectar (ni Calendar ni Books)', async () => {
    expect(googleCalendarConnection({ access_token: 'a', refresh_token: 'r', scope: 'openid https://www.googleapis.com/auth/calendar.events.readonly' })).toMatchObject({ credentials: { refreshToken: 'r', sharedGrant: '1' } });
    expect(() => googleCalendarConnection({ access_token: 'a', scope: 'openid' })).toThrow(/Google Calendar/);
    expect(googleBooksConnection({ access_token: 'a', refresh_token: 'r' }, { shared: true })).toMatchObject({ credentials: { sharedGrant: '1' } });
    expect(googleBooksConnection({ access_token: 'a', refresh_token: 'r' })).not.toMatchObject({ credentials: { sharedGrant: '1' } });
  });
});

describe('Google Data Portability · scopes restringidos', () => {
  it('sin CASA (producción) se piden solo los grupos sensibles', async () => {
    const { portabilityGroups, RESTRICTED_RESOURCE_GROUPS } = await import('../src/profile/google-portability/constants.js');
    expect(portabilityGroups(true)).toEqual(expect.arrayContaining([...RESTRICTED_RESOURCE_GROUPS]));
    const sensitive = portabilityGroups(false);
    expect(sensitive).not.toContain('myactivity.youtube');
    expect(sensitive).not.toContain('maps.starred_places');
    expect(sensitive).toEqual(expect.arrayContaining(['maps.reviews', 'youtube.music', 'youtube.subscriptions', 'saved.collections']));
    expect(sensitive).toHaveLength(portabilityGroups(true).length - 2);
  });
});

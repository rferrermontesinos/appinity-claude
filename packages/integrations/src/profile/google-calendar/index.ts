import {
  SourceError,
  isSourceError,
  type AuthResult,
  type EntityIdentifier,
  type IdentifiedEntity,
  type NormalizeContext,
  type NormalizedObservation,
  type ProfileSourceAdapter,
  type ProfileSourceManifest,
  type SyncBatch,
  type SyncContext,
} from '@appinity/shared';
import { z } from 'zod';

/**
 * Google Calendar (fase 11): planes del usuario que delatan gustos — un restaurante, un museo, un teatro, un concierto
 * o una película. Documentación oficial (developers.google.com/calendar/api, consultada el 2026-10-22):
 * - Scope `calendar.events.readonly` (sensible: en producción exige la verificación de la app, gratuita).
 * - `GET /calendar/v3/calendars/primary/events` con `singleEvents` y `eventTypes` (default y fromGmail: las reservas
 *   que Gmail añade solas). Los cumpleaños, fuera de oficina y tiempo de concentración no se leen.
 * Se pide en el MISMO consentimiento de «Continuar con Google» (regla de producto: un único momento de permisos).
 *
 * Privacidad (especificación §9): los eventos se procesan en memoria y solo se guarda lo identificado (el lugar, el
 * artista o la película), nunca el título, la descripción ni los asistentes del evento.
 * Semántica (especificación §6): un evento en el calendario es intención, no asistencia: conocido ≈ 0,8, consumido 0,
 * preferencia NULL.
 */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
export const GOOGLE_CALENDAR_MAPPER_VERSION = 'google-calendar-v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const PAST_DAYS = 730;
const FUTURE_DAYS = 180;
const MAX_EVENTS = 5000;
const KNOWN_FROM_CALENDAR = 0.8;

export const GOOGLE_CALENDAR_MANIFEST: ProfileSourceManifest = {
  key: 'google_calendar',
  name: 'Google Calendar',
  categories: ['food', 'culture', 'music', 'movies'],
  authentication: 'oauth2',
  syncStrategy: 'scheduled',
  capabilities: { known: true, consumed: false, explicitRating: false, implicitPreference: false, history: true, incrementalSync: false },
  availability: 'available',
  simulated: false,
  description: 'Restaurantes, museos, teatros, conciertos y películas de tu calendario. Solo se guarda lo identificado, nunca tus eventos.',
};

const eventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  eventType: z.string().optional(),
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
});
const pageSchema = z.object({ items: z.array(eventSchema).optional(), nextPageToken: z.string().optional() });
const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional(), scope: z.string().optional() });

export type CalendarEvent = z.infer<typeof eventSchema>;

/** Lo que se busca en el catálogo a partir de un evento. Nada de esto se guarda tal cual. */
export type CalendarCandidate =
  | { kind: 'place'; name: string; address?: string; date: string }
  | { kind: 'artist'; name: string; date: string }
  | { kind: 'movie'; title: string; date: string };

const ONLINE = /(https?:\/\/|zoom|google meet|meet\.google|teams|skype|webex|online|videollamada|video call)/i;
const PRIVATE_PLACE = /^(casa|mi casa|home|oficina|office|trabajo|work|despacho|gym|gimnasio)$/i;
/** Una dirección sin nombre de lugar (p. ej., una consulta médica) no se envía a geocodificar. */
const STREET = /^(calle|c\/|avenida|avda\.?|av\.|plaza|pza\.?|paseo|pº|carrer|carretera|camino|ronda|travesía|rua|rue|via|street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd\.?|lane)\s/i;
const CONCERT_PREFIX = /^(?:concierto(?:\s+de)?|concert(?:\s+of)?|gig)\s*[:\-–]?\s+(.{2,80})$/i;
const CONCERT_SUFFIX = /^(.{2,80}?)\s*(?:[-–:]\s*)?(?:en concierto|en directo|in concert|live|\(concierto\)|\(concert\))$/i;
const MOVIE_PREFIX = /^(?:cine|película|pelicula|movie|film)\s*[:\-–]\s*(.{2,100})$/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^["'«“]|["'»”]$/g, '').trim();

/**
 * Candidatos de un evento:
 * - lugar: la primera parte de `location` es el nombre y el resto la dirección (como las reservas de Gmail y los
 *   lugares de Maps). Se ignoran ubicaciones en línea, direcciones sin nombre y lugares privados.
 * - concierto o película: solo con un prefijo o sufijo explícito en el título («Concierto: Rosalía», «Cine: Dune»).
 */
export function calendarCandidates(events: CalendarEvent[]): CalendarCandidate[] {
  const out: CalendarCandidate[] = [];
  for (const event of events) {
    if (event.status === 'cancelled') continue;
    if (event.eventType && event.eventType !== 'default' && event.eventType !== 'fromGmail') continue;
    const date = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00Z` : undefined);
    if (!date) continue;
    const location = event.location?.trim();
    if (location && !ONLINE.test(location)) {
      const [first, ...rest] = location.split(',').map((s) => s.trim());
      if (first && !/^\d/.test(first) && !PRIVATE_PLACE.test(first) && !STREET.test(first) && first.length >= 3) {
        out.push({ kind: 'place', name: first, ...(rest.length ? { address: rest.join(', ') } : {}), date });
      }
    }
    const summary = clean(event.summary ?? '');
    const concert = CONCERT_PREFIX.exec(summary) ?? CONCERT_SUFFIX.exec(summary);
    if (concert?.[1]) out.push({ kind: 'artist', name: clean(concert[1]), date });
    const movie = MOVIE_PREFIX.exec(summary);
    if (movie?.[1]) out.push({ kind: 'movie', title: clean(movie[1]), date });
  }
  return out;
}

interface CalendarRecord {
  recordId: string;
  identified: IdentifiedEntity;
  events: number;
  /** Último evento (pasado o futuro). */
  date: string;
  upcoming: boolean;
}

/** Una observación por objeto identificado (un mismo restaurante en varios eventos cuenta una vez). */
export function mapCalendar(raw: unknown, context: NormalizeContext): NormalizedObservation[] {
  const { recordId, identified, events, date, upcoming } = raw as CalendarRecord;
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  return [
    {
      userId: context.userId,
      source: 'google_calendar',
      sourceRecordId: recordId,
      observationKind: 'gcal_event',
      mapperVersion: GOOGLE_CALENDAR_MAPPER_VERSION,
      category: identified.category,
      externalItem: {
        sourceId: recordId,
        itemType: identified.itemType,
        title: identified.title,
        canonicalIds: identified.canonicalIds,
        ...(identified.releaseYear || identified.location
          ? {
              attributes: {
                ...(identified.releaseYear ? { releaseYear: identified.releaseYear } : {}),
                ...(identified.location ? { location: identified.location } : {}),
              },
            }
          : {}),
      },
      occurredAt: date,
      timestampPrecision: 'day',
      knownConfidence: round(KNOWN_FROM_CALENDAR * identified.confidence),
      consumedConfidence: 0,
      preferenceScore: null,
      preferenceConfidence: null,
      preferenceBasis: null,
      engagement: { type: 'saved', value: events, unit: 'calendar_events' },
      metadata: { snapshot: true, events, upcoming, identification: { method: identified.method, confidence: identified.confidence } },
    },
  ];
}

export interface GoogleCalendarOptions {
  clientId: string;
  clientSecret: string;
  /** Solo el worker (sync). */
  identifier?: EntityIdentifier;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** Credenciales del permiso concedido en el alta. El permiso es compartido con el inicio de sesión: no se revoca. */
export function googleCalendarConnection(token: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }): AuthResult {
  if (token.scope && !token.scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new SourceError('verification_failed', 'No se concedió el permiso de Google Calendar', false);
  }
  const credentials: Record<string, string> = token.refresh_token
    ? { refreshToken: token.refresh_token }
    : { accessToken: token.access_token, accessTokenExpiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString() };
  return { kind: 'connected', credentials: { ...credentials, sharedGrant: '1' }, scopes: [GOOGLE_CALENDAR_SCOPE] };
}

export function createGoogleCalendarAdapter(options: GoogleCalendarOptions): ProfileSourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  async function accessToken(credentials: Record<string, string> | undefined): Promise<string> {
    if (credentials?.refreshToken) {
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: options.clientId, client_secret: options.clientSecret, grant_type: 'refresh_token', refresh_token: credentials.refreshToken }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 400 || response.status === 401) {
        throw new SourceError('auth', 'El permiso de Google Calendar ha caducado o se ha revocado: vuelve a entrar con Google', false);
      }
      if (!response.ok) throw new SourceError('unavailable', `Google respondió HTTP ${response.status}`, response.status >= 500);
      return tokenSchema.parse(await response.json()).access_token;
    }
    const expires = Date.parse(credentials?.accessTokenExpiresAt ?? '');
    if (credentials?.accessToken && expires - Date.now() > 60_000) return credentials.accessToken;
    throw new SourceError('verification_failed', 'El acceso a Google Calendar ha caducado: vuelve a entrar con Google', false);
  }

  async function events(token: string): Promise<CalendarEvent[]> {
    const out: CalendarEvent[] = [];
    const t = now().getTime();
    let pageToken: string | undefined;
    do {
      const url = new URL(API);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('maxResults', '2500');
      url.searchParams.set('timeMin', new Date(t - PAST_DAYS * 86_400_000).toISOString());
      url.searchParams.set('timeMax', new Date(t + FUTURE_DAYS * 86_400_000).toISOString());
      url.searchParams.append('eventTypes', 'default');
      url.searchParams.append('eventTypes', 'fromGmail');
      // Solo los campos necesarios: ni descripción, ni asistentes, ni enlaces.
      url.searchParams.set('fields', 'items(id,status,summary,location,eventType,start),nextPageToken');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 401) throw new SourceError('auth', 'El permiso de Google Calendar ya no es válido: vuelve a entrar con Google', false);
      if (response.status === 403) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        const disabled = /has not been used|is disabled/i.test(body.error?.message ?? '');
        throw new SourceError('not_configured', disabled ? 'La Google Calendar API no está activada en el proyecto de Google Cloud' : 'Google denegó el acceso al calendario', false);
      }
      if (response.status === 429 || response.status >= 500) throw new SourceError('unavailable', `Google Calendar respondió HTTP ${response.status}`, true);
      if (!response.ok) throw new SourceError('bad_response', `Google Calendar respondió HTTP ${response.status}`, false);
      const page = pageSchema.parse(await response.json());
      out.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken && out.length < MAX_EVENTS);
    return out;
  }

  return {
    manifest: GOOGLE_CALENDAR_MANIFEST,
    requestedScopes: [GOOGLE_CALENDAR_SCOPE],
    supportsRenewal: true,
    snapshotObservationKinds: ['gcal_event'],
    async connect(): Promise<AuthResult> {
      // Un único momento de permisos: el calendario se concede en «Continuar con Google», no en una conexión aparte.
      throw new SourceError('not_configured', 'Google Calendar se concede al entrar con Google: cierra sesión y vuelve a entrar con «Continuar con Google»', false);
    },
    async sync(context: SyncContext): Promise<SyncBatch> {
      const identifier = options.identifier;
      if (!identifier) throw new SourceError('not_configured', 'Falta el identificador de catálogo para Google Calendar', false);
      const token = await accessToken(context.credentials);
      const candidates = calendarCandidates(await events(token));
      const places = candidates.filter((c): c is Extract<CalendarCandidate, { kind: 'place' }> => c.kind === 'place');
      const artists = candidates.filter((c): c is Extract<CalendarCandidate, { kind: 'artist' }> => c.kind === 'artist');
      const movies = candidates.filter((c): c is Extract<CalendarCandidate, { kind: 'movie' }> => c.kind === 'movie');
      const found: Array<{ entity: IdentifiedEntity; date: string }> = [];
      let unidentified = 0;
      try {
        // Lugares únicos por nombre y dirección: un restaurante repetido se geocodifica una vez.
        const placeKey = (p: { name: string; address?: string }) => `${p.name}|${p.address ?? ''}`.toLowerCase();
        const uniquePlaces = [...new Map(places.map((p) => [placeKey(p), p])).values()];
        const placeIds = await identifier.identifyPlacesByText(uniquePlaces.map((p) => ({ name: p.name, ...(p.address ? { address: p.address } : {}) })));
        const byPlace = new Map(uniquePlaces.map((p, i) => [placeKey(p), placeIds[i]]));
        for (const p of places) {
          const r = byPlace.get(placeKey(p));
          if (r && 'entity' in r && r.entity) found.push({ entity: r.entity, date: p.date });
          else unidentified++;
        }
        const names = [...new Set(artists.map((a) => a.name))];
        const artistIds = names.length ? await identifier.identifyArtists(names) : [];
        const byArtist = new Map(names.map((n, i) => [n, artistIds[i]]));
        for (const a of artists) {
          const r = byArtist.get(a.name);
          if (r?.entity) found.push({ entity: r.entity, date: a.date });
          else unidentified++;
        }
        for (const m of movies) {
          const entity = await identifier.identifyWork({ title: m.title, languages: ['es', 'en'], categories: ['movies'] });
          if (entity) found.push({ entity, date: m.date });
          else unidentified++;
        }
      } catch (error) {
        if (isSourceError(error) && error.retryable) {
          return { records: [], cursor: null, hasMore: false, partialErrors: [], snapshotComplete: false, pending: { retryAfterMs: 10 * 60_000, reason: `${error.message} (identificación de catálogo)` } };
        }
        throw error;
      }
      const t = now().toISOString();
      const records = new Map<string, CalendarRecord>();
      for (const { entity, date } of found) {
        const [idKey, idValue] = Object.entries(entity.canonicalIds)[0] ?? [];
        if (!idKey || !idValue) continue;
        const recordId = `${entity.category}:${idKey}:${idValue}`;
        const current = records.get(recordId);
        if (current) {
          current.events++;
          if (date > current.date) current.date = date;
          current.upcoming = current.upcoming || date > t;
        } else {
          records.set(recordId, { recordId, identified: entity, events: 1, date, upcoming: date > t });
        }
      }
      return {
        records: [...records.values()],
        cursor: null,
        hasMore: false,
        partialErrors: unidentified
          ? [{ code: 'unidentified', message: `${unidentified} de ${candidates.length} planes del calendario no se pudieron identificar con seguridad`, blocking: false }]
          : [],
        snapshotComplete: true,
        snapshotKinds: ['gcal_event'],
        stats: { gcal_candidates: candidates.length, gcal_identified: records.size },
      };
    },
    normalize: async (record, context) => mapCalendar(record, context),
    // El permiso es el mismo del inicio de sesión: revocarlo cerraría también la sesión con Google y Google Books.
    // Se borran las credenciales; la persona puede retirar el acceso en myaccount.google.com/connections.
    async disconnect() {},
  };
}

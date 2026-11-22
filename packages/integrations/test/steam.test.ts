import { SourceError, parseObservation, type SyncContext } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../src/registry.js';
import { buildSteamOpenIdUrl, verifySteamOpenId } from '../src/profile/steam/auth.js';
import { SteamClient } from '../src/profile/steam/client.js';
import { steamCapsuleUrl } from '../src/profile/steam/constants.js';
import {
  OWNED_GAMES_EMPTY,
  OWNED_GAMES_HIDDEN,
  SIMULATED_STEAM_IDS,
  createFakeSteamFetch,
  openIdCallbackParams,
} from '../src/profile/steam/fixtures/responses.js';
import { mapSteamGame } from '../src/profile/steam/mapper.js';
import { syncSteam } from '../src/profile/steam/sync.js';

const KEY = '0123456789ABCDEF0123456789ABCDEF';
const USER = '10000000-0000-4000-a000-0000000000aa';
const RETURN_TO = 'http://192.168.1.16:3100/v1/connect/steam/callback?state=abcdefghijklmnopqrstuvwx';
const noSleep = async () => undefined;

const ctx = (stats?: Record<string, number>) => ({ userId: USER, connectionId: '20000000-0000-4000-a000-000000000001', source: 'steam' as const, ...(stats ? { stats } : {}) });

function syncContext(steamid: string): SyncContext {
  return {
    connection: { id: '20000000-0000-4000-a000-000000000001', userId: USER, sourceKey: 'steam', status: 'active', externalAccountRef: steamid, cursor: null },
    cursor: null,
    pageSize: 50,
    now: new Date('2026-10-08T12:00:00Z'),
  };
}

describe('Steam OpenID', () => {
  it('construye la URL de checkid_setup con identifier_select y el return_to dentro del realm', () => {
    const url = new URL(buildSteamOpenIdUrl({ returnTo: RETURN_TO, realm: 'http://192.168.1.16:3100/' }));
    expect(url.origin + url.pathname).toBe('https://steamcommunity.com/openid/login');
    expect(url.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(url.searchParams.get('openid.return_to')).toBe(RETURN_TO);
    expect(url.searchParams.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select');
    expect(() => buildSteamOpenIdUrl({ returnTo: 'https://evil.example/x', realm: 'http://192.168.1.16:3100/' })).toThrow();
  });

  it('acepta una respuesta válida y confirmada por Steam, y devuelve el SteamID como texto', async () => {
    const { fetchImpl, calls } = createFakeSteamFetch();
    const params = openIdCallbackParams(RETURN_TO, SIMULATED_STEAM_IDS.publicLibrary);
    await expect(verifySteamOpenId(params, RETURN_TO, fetchImpl)).resolves.toBe('76561190000000001');
    expect(calls).toEqual(['steamcommunity.com/openid/login']);
  });

  it('rechaza respuestas manipuladas, de otro proveedor, caducadas o no confirmadas', async () => {
    const { fetchImpl } = createFakeSteamFetch();
    const good = openIdCallbackParams(RETURN_TO, SIMULATED_STEAM_IDS.publicLibrary);
    const cases: Array<Record<string, string>> = [
      { ...good, 'openid.mode': 'cancel' },
      { ...good, 'openid.op_endpoint': 'https://evil.example/openid/login' },
      { ...good, 'openid.return_to': RETURN_TO.replace('state=a', 'state=z') },
      { ...good, 'openid.claimed_id': 'https://steamcommunity.com/openid/id/123', 'openid.identity': 'https://steamcommunity.com/openid/id/123' },
      { ...good, 'openid.signed': 'op_endpoint,claimed_id' },
      openIdCallbackParams(RETURN_TO, SIMULATED_STEAM_IDS.publicLibrary, new Date(Date.now() - 60 * 60 * 1000)),
    ];
    for (const params of cases) {
      await expect(verifySteamOpenId(params, RETURN_TO, fetchImpl)).rejects.toBeInstanceOf(SourceError);
    }
    const invalid = createFakeSteamFetch({ openIdValid: false });
    await expect(verifySteamOpenId(good, RETURN_TO, invalid.fetchImpl)).rejects.toThrow(/no confirma/);
  });
});

describe('cliente de la Steam Web API', () => {
  it('reintenta 429 y 5xx con backoff y termina obteniendo la biblioteca', async () => {
    const { fetchImpl } = createFakeSteamFetch({ failuresBeforeSuccess: [429, 503] });
    const client = new SteamClient({ apiKey: KEY, fetchImpl, sleep: noSleep });
    const owned = await client.getOwnedGames(SIMULATED_STEAM_IDS.publicLibrary);
    expect(owned?.gameCount).toBe(7);
  });

  it('agotados los reintentos, el límite es un error reintentable', async () => {
    const { fetchImpl } = createFakeSteamFetch({ failuresBeforeSuccess: [429, 429, 429, 429, 429] });
    const client = new SteamClient({ apiKey: KEY, fetchImpl, sleep: noSleep });
    const error = await client.getOwnedGames(SIMULATED_STEAM_IDS.publicLibrary).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'rate_limited', retryable: true });
  });

  it('una clave rechazada no se reintenta y el mensaje no contiene la clave', async () => {
    const { fetchImpl, calls } = createFakeSteamFetch({ forceStatus: 403 });
    const client = new SteamClient({ apiKey: KEY, fetchImpl, sleep: noSleep });
    const error = (await client.getPlayerVisibility(SIMULATED_STEAM_IDS.publicLibrary).catch((e: unknown) => e)) as SourceError;
    expect(error).toMatchObject({ code: 'auth', retryable: false });
    expect(error.message).not.toContain(KEY);
    expect(calls).toHaveLength(1);
  });

  it('distingue una biblioteca oculta (sin game_count) de una vacía', async () => {
    const hidden = new SteamClient({ apiKey: KEY, sleep: noSleep, fetchImpl: createFakeSteamFetch({ owned: { x: OWNED_GAMES_HIDDEN } }).fetchImpl });
    const empty = new SteamClient({
      apiKey: KEY,
      sleep: noSleep,
      fetchImpl: createFakeSteamFetch({ owned: { [SIMULATED_STEAM_IDS.emptyLibrary]: OWNED_GAMES_EMPTY, [SIMULATED_STEAM_IDS.hiddenGameDetails]: OWNED_GAMES_HIDDEN } }).fetchImpl,
    });
    expect(await empty.getOwnedGames(SIMULATED_STEAM_IDS.emptyLibrary)).toEqual({ gameCount: 0, games: [] });
    expect(await empty.getOwnedGames(SIMULATED_STEAM_IDS.hiddenGameDetails)).toBeNull();
    expect(hidden).toBeDefined();
  });

  it('exige una clave configurada', () => {
    expect(() => new SteamClient({ apiKey: '' })).toThrow(/STEAM_WEB_API_KEY/);
  });
});

describe('sync de Steam', () => {
  const client = (options: Parameters<typeof createFakeSteamFetch>[0] = {}) =>
    new SteamClient({ apiKey: KEY, sleep: noSleep, fetchImpl: createFakeSteamFetch(options).fetchImpl });

  it('entrega la biblioteca como instantánea completa, con la entrada corrupta como error parcial', async () => {
    const batch = await syncSteam(client(), syncContext(SIMULATED_STEAM_IDS.publicLibrary));
    expect(batch.snapshotComplete).toBe(true);
    expect(batch.hasMore).toBe(false);
    expect(batch.records).toHaveLength(6);
    expect(batch.partialErrors).toEqual([{ sourceRecordId: 'app:corrupto', code: 'invalid_record', message: expect.any(String) }]);
    expect(batch.stats?.playtimeP95Hours).toBeGreaterThan(0);
    expect(batch.stats?.libraryGameCount).toBe(7);
  });

  it('un perfil privado o con detalles de juegos ocultos falla con un mensaje accionable y no reintentable', async () => {
    const hidden = client({ owned: { [SIMULATED_STEAM_IDS.hiddenGameDetails]: OWNED_GAMES_HIDDEN } });
    const hiddenError = await syncSteam(hidden, syncContext(SIMULATED_STEAM_IDS.hiddenGameDetails)).catch((e: unknown) => e);
    expect(hiddenError).toMatchObject({ code: 'profile_inaccessible', retryable: false });
    expect((hiddenError as Error).message).toMatch(/Detalles de juegos/);

    const privateProfile = client({
      owned: { [SIMULATED_STEAM_IDS.privateProfile]: OWNED_GAMES_HIDDEN },
      visibility: { [SIMULATED_STEAM_IDS.privateProfile]: 1 },
    });
    const privateError = await syncSteam(privateProfile, syncContext(SIMULATED_STEAM_IDS.privateProfile)).catch((e: unknown) => e);
    expect((privateError as Error).message).toMatch(/perfil de Steam no es público/);
  });

  it('una biblioteca vacía es válida', async () => {
    const batch = await syncSteam(client({ owned: { [SIMULATED_STEAM_IDS.emptyLibrary]: OWNED_GAMES_EMPTY } }), syncContext(SIMULATED_STEAM_IDS.emptyLibrary));
    expect(batch.records).toHaveLength(0);
    expect(batch.snapshotComplete).toBe(true);
  });

  it('rechaza conexiones sin un SteamID válido', async () => {
    await expect(syncSteam(client(), syncContext('123'))).rejects.toMatchObject({ code: 'verification_failed' });
  });
});

describe('mapper de Steam', () => {
  it('juego comprado con 0 horas: conocido, no consumido, preferencia NULL', () => {
    const [o] = mapSteamGame({ appid: 1127400, name: 'Mindustry', playtime_forever: 0, rtime_last_played: 0 }, ctx({ playtimeP95Hours: 50 }));
    expect(parseObservation(o)).toMatchObject({
      knownConfidence: 1,
      consumedConfidence: 0,
      preferenceScore: null,
      preferenceConfidence: null,
      preferenceBasis: null,
      observationKind: 'library',
      sourceRecordId: 'app:1127400',
      mapperVersion: 'steam-v1',
    });
    expect(o!.occurredAt).toBeUndefined();
    expect(o!.engagement).toEqual({ type: 'owned', value: 0, unit: 'hours' });
  });

  it('pocas horas: consumido sin preferencia; muchas horas: preferencia inferida calibrada', () => {
    const [few] = mapSteamGame({ appid: 367520, name: 'Hollow Knight', playtime_forever: 45, rtime_last_played: 1771113600 }, ctx({ playtimeP95Hours: 70 }));
    const [many] = mapSteamGame({ appid: 1145360, name: 'Hades', playtime_forever: 4200, rtime_last_played: 1788912000 }, ctx({ playtimeP95Hours: 70 }));
    expect(few).toMatchObject({ consumedConfidence: 1, preferenceScore: null });
    expect(few!.occurredAt).toBe('2026-02-15T00:00:00.000Z');
    expect(many).toMatchObject({ consumedConfidence: 1, preferenceBasis: 'strong_behavior', preferenceConfidence: 0.6 });
    expect(many!.preferenceScore!).toBeCloseTo(1, 4);
  });

  it('la imagen de Steam es solo una referencia con su política, y faltar el nombre no inventa un título real', () => {
    const [o] = mapSteamGame({ appid: 999999, playtime_forever: 10 }, ctx());
    expect(o!.externalItem.title).toBe('Steam app 999999');
    expect(o!.metadata).toMatchObject({ nameUnavailable: true });
    expect(o!.externalItem.imageCandidate).toMatchObject({
      url: steamCapsuleUrl(999999),
      source: 'steam_cdn',
      rightsOrPolicyReference: 'https://steamcommunity.com/dev/apiterms',
      isFallback: false,
    });
    expect(o!.externalItem.canonicalIds).toEqual({ 'steam:app': '999999' });
  });
});

describe('registro con Steam', () => {
  it('sin clave, Steam aparece como «sin configurar» y no es conectable', () => {
    const steam = createAdapterRegistry({ demoMode: false }).manifests().find((m) => m.key === 'steam')!;
    expect(steam).toMatchObject({ availability: 'unconfigured', connectable: false, authentication: 'openid' });
    expect(steam.unavailableReason).toMatch(/STEAM_WEB_API_KEY/);
  });

  it('con clave, se registra el adapter con capacidades verificadas', () => {
    const registry = createAdapterRegistry({ demoMode: false, steam: { apiKey: KEY } });
    const adapter = registry.get('steam')!;
    expect(adapter.manifest).toMatchObject({ availability: 'available', simulated: false, syncStrategy: 'scheduled' });
    expect(adapter.manifest.capabilities).toEqual({
      known: true,
      consumed: true,
      explicitRating: false,
      implicitPreference: true,
      history: false,
      incrementalSync: false,
    });
    expect(adapter.snapshotObservationKinds).toEqual(['library']);
  });
});

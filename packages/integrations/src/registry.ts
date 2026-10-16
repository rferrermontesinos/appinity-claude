import type { ProfileSourceAdapter, ProfileSourceManifest } from '@appinity/shared';
import { PLANNED_MANIFESTS } from './planned.js';
import { createFixtureAdapters } from './profile/fixture/index.js';
import {
  GOOGLE_PORTABILITY_MANIFEST,
  createGooglePortabilityAdapter,
  type GooglePortabilityAdapterOptions,
} from './profile/google-portability/index.js';
import { GOOGLE_BOOKS_MANIFEST, createGoogleBooksAdapter, type GoogleBooksOptions } from './profile/google-books/index.js';
import { STEAM_MANIFEST, createSteamAdapter, type SteamAdapterOptions } from './profile/steam/index.js';
import { ANILIST_MANIFEST, createAniListAdapter, type AniListOptions } from './profile/anilist/index.js';
import { TRAKT_MANIFEST, createTraktAdapter, type TraktOptions } from './profile/trakt/index.js';

export type VisibleManifest = ProfileSourceManifest & {
  connectable: boolean;
  plannedPhase?: string;
  unavailableReason?: string;
  supportsRenewal?: boolean;
};

/** Registro genérico de adapters: resuelve cada fuente por su clave (§8). */
export interface AdapterRegistry {
  get(key: string): ProfileSourceAdapter | undefined;
  adapters(): ProfileSourceAdapter[];
  /** Manifests visibles: adapters registrados + fuentes previstas o sin configurar (no conectables). */
  manifests(): VisibleManifest[];
}

export interface RegistryOptions {
  demoMode: boolean;
  /** Steam solo se registra si el servidor tiene STEAM_WEB_API_KEY. */
  steam?: Partial<SteamAdapterOptions>;
  /** Google solo se registra si el servidor tiene el cliente OAuth (GOOGLE_OAUTH_CLIENT_ID y _SECRET). */
  google?: Partial<GooglePortabilityAdapterOptions>;
  /** Google Books: mismo cliente OAuth, con su propia URL de vuelta. */
  googleBooks?: Partial<GoogleBooksOptions>;
  /** Trakt: solo si el servidor tiene TRAKT_CLIENT_ID. */
  trakt?: Partial<TraktOptions>;
  /** AniList: solo si el servidor tiene ANILIST_CLIENT_ID y ANILIST_CLIENT_SECRET. */
  anilist?: Partial<AniListOptions>;
}

/** Fuente real implementada pero sin su configuración de servidor: visible, no conectable y con el motivo. */
function unconfigured(map: Map<string, ProfileSourceAdapter>, manifest: ProfileSourceManifest, reason: string): VisibleManifest[] {
  return map.has(manifest.key) ? [] : [{ ...manifest, availability: 'unconfigured', connectable: false, unavailableReason: reason }];
}

/**
 * Las fuentes fixture solo se registran con DEMO_MODE. Las reales, cuando su configuración existe. Añadir una
 * fuente solo requiere su adapter y su registro aquí, sin tocar las reglas centrales.
 */
export function createAdapterRegistry(options: RegistryOptions): AdapterRegistry {
  const map = new Map<string, ProfileSourceAdapter>();
  if (options.demoMode) for (const adapter of createFixtureAdapters()) map.set(adapter.manifest.key, adapter);
  const steamKey = options.steam?.apiKey;
  if (steamKey) map.set('steam', createSteamAdapter({ ...options.steam, apiKey: steamKey }));
  const google = options.google;
  if (google?.clientId && google.clientSecret && google.redirectUri) {
    map.set(
      'google_portability',
      createGooglePortabilityAdapter({ ...google, clientId: google.clientId, clientSecret: google.clientSecret, redirectUri: google.redirectUri }),
    );
  }
  const books = options.googleBooks;
  if (books?.clientId && books.clientSecret && books.redirectUri) {
    map.set('google_books', createGoogleBooksAdapter({ ...books, clientId: books.clientId, clientSecret: books.clientSecret, redirectUri: books.redirectUri }));
  }
  const trakt = options.trakt;
  if (trakt?.clientId && trakt.redirectUri) map.set('trakt', createTraktAdapter({ ...trakt, clientId: trakt.clientId, redirectUri: trakt.redirectUri }));
  const anilist = options.anilist;
  if (anilist?.clientId && anilist.clientSecret && anilist.redirectUri) {
    map.set('anilist', createAniListAdapter({ ...anilist, clientId: anilist.clientId, clientSecret: anilist.clientSecret, redirectUri: anilist.redirectUri }));
  }
  return {
    get: (key) => map.get(key),
    adapters: () => [...map.values()],
    manifests: () => [
      ...[...map.values()].map((a) => ({ ...a.manifest, connectable: true, ...(a.supportsRenewal ? { supportsRenewal: true } : {}) })),
      ...unconfigured(map, STEAM_MANIFEST, 'Falta STEAM_WEB_API_KEY en el .env del servidor (ver README, «Conectar tu cuenta de Steam»)'),
      ...unconfigured(
        map,
        GOOGLE_PORTABILITY_MANIFEST,
        'Falta el cliente OAuth de Google en el .env del servidor (ver README, «Conectar tu cuenta de Google»)',
      ),
      ...unconfigured(map, TRAKT_MANIFEST, 'Falta TRAKT_CLIENT_ID en el .env del servidor (crea la app en Trakt)'),
      ...unconfigured(map, ANILIST_MANIFEST, 'Faltan ANILIST_CLIENT_ID y ANILIST_CLIENT_SECRET en el .env del servidor (crea la app en AniList)'),
      ...unconfigured(map, GOOGLE_BOOKS_MANIFEST, 'Falta el cliente OAuth de Google en el .env del servidor'),
      ...PLANNED_MANIFESTS.filter((p) => !map.has(p.key) && p.key !== 'google_portability' && p.key !== 'google_books').map((p) => ({ ...p, connectable: false })),
    ],
  };
}

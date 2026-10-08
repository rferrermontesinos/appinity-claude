import type { ProfileSourceAdapter, ProfileSourceManifest } from '@appinity/shared';
import { PLANNED_MANIFESTS } from './planned.js';
import { createFixtureAdapters } from './profile/fixture/index.js';
import { STEAM_MANIFEST, createSteamAdapter, type SteamAdapterOptions } from './profile/steam/index.js';
import { TMDB_MANIFEST, createTmdbAdapter, type TmdbAdapterOptions } from './profile/tmdb/index.js';

export type VisibleManifest = ProfileSourceManifest & { connectable: boolean; plannedPhase?: string; unavailableReason?: string };

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
  /** TMDb solo se registra si el servidor tiene TMDB_API_READ_TOKEN (autenticación de la aplicación). */
  tmdb?: Partial<TmdbAdapterOptions>;
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
  const tmdbToken = options.tmdb?.readToken;
  if (tmdbToken) map.set('tmdb', createTmdbAdapter({ ...options.tmdb, readToken: tmdbToken }));
  return {
    get: (key) => map.get(key),
    adapters: () => [...map.values()],
    manifests: () => [
      ...[...map.values()].map((a) => ({ ...a.manifest, connectable: true })),
      ...unconfigured(map, STEAM_MANIFEST, 'Falta STEAM_WEB_API_KEY en el .env del servidor (ver README, «Conectar tu cuenta de Steam»)'),
      ...unconfigured(map, TMDB_MANIFEST, 'Falta TMDB_API_READ_TOKEN en el .env del servidor (ver README, «Conectar tu cuenta de TMDb»)'),
      ...PLANNED_MANIFESTS.filter((p) => !map.has(p.key)).map((p) => ({ ...p, connectable: false })),
    ],
  };
}

/** Fuente real implementada pero sin su configuración de servidor: visible, no conectable y con el motivo. */
function unconfigured(map: Map<string, ProfileSourceAdapter>, manifest: ProfileSourceManifest, reason: string): VisibleManifest[] {
  return map.has(manifest.key) ? [] : [{ ...manifest, availability: 'unconfigured', connectable: false, unavailableReason: reason }];
}

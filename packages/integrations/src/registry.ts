import type { ProfileSourceAdapter, ProfileSourceManifest } from '@appinity/shared';
import { PLANNED_MANIFESTS } from './planned.js';
import { createFixtureAdapters } from './profile/fixture/index.js';

/** Registro genérico de adapters: resuelve cada fuente por su clave (§8). */
export interface AdapterRegistry {
  get(key: string): ProfileSourceAdapter | undefined;
  adapters(): ProfileSourceAdapter[];
  /** Manifests visibles: adapters registrados + fuentes previstas no conectables. */
  manifests(): Array<ProfileSourceManifest & { connectable: boolean; plannedPhase?: string }>;
}

/**
 * Las fuentes fixture solo se registran con DEMO_MODE. Añadir una fuente real solo requiere su adapter y su
 * registro aquí, sin tocar las reglas centrales.
 */
export function createAdapterRegistry(options: { demoMode: boolean }): AdapterRegistry {
  const map = new Map<string, ProfileSourceAdapter>();
  if (options.demoMode) for (const adapter of createFixtureAdapters()) map.set(adapter.manifest.key, adapter);
  return {
    get: (key) => map.get(key),
    adapters: () => [...map.values()],
    manifests: () => [
      ...[...map.values()].map((a) => ({ ...a.manifest, connectable: true })),
      ...PLANNED_MANIFESTS.filter((p) => !map.has(p.key)).map((p) => ({ ...p, connectable: false })),
    ],
  };
}

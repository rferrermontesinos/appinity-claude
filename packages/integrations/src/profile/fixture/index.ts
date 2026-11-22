import { FIXTURE_SOURCE_KEYS, type FixtureSourceKey, type ProfileSourceAdapter } from '@appinity/shared';
import { connectFixture } from './auth.js';
import { FixtureClient } from './client.js';
import { FIXTURE_MANIFESTS } from './manifest.js';
import { FIXTURE_MAPPERS } from './mapper.js';
import { syncFixture } from './sync.js';

export { FIXTURE_MANIFESTS } from './manifest.js';
export * from './constants.js';
export * from './mapper.js';
export { FixtureClient } from './client.js';
export { syncFixture } from './sync.js';

/** Tipos de observación que forman instantáneas completas en cada fuente simulada. */
const SNAPSHOT_KINDS: Partial<Record<FixtureSourceKey, readonly string[]>> = {
  fixture_play: ['library'],
  fixture_audio: ['playcount', 'loved_track', 'listening', 'subscription'],
};

export function createFixtureAdapter(source: FixtureSourceKey): ProfileSourceAdapter {
  const client = new FixtureClient(source);
  const kinds = SNAPSHOT_KINDS[source];
  return {
    manifest: FIXTURE_MANIFESTS[source],
    ...(kinds ? { snapshotObservationKinds: kinds } : {}),
    connect: (context) => connectFixture(source, context),
    sync: (context) => syncFixture(client, context),
    normalize: async (record, context) => FIXTURE_MAPPERS[source](record, context),
    // Nada que revocar en un proveedor: la fuente es local y simulada.
    disconnect: async () => undefined,
  };
}

export function createFixtureAdapters(): ProfileSourceAdapter[] {
  return FIXTURE_SOURCE_KEYS.map(createFixtureAdapter);
}

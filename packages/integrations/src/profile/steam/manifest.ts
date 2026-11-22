import type { ProfileSourceManifest } from '@appinity/shared';

/**
 * Steam. Capacidades verificadas en la documentación oficial (2026-10-08): propiedad y horas acumuladas
 * (GetOwnedGames), sin valoraciones explícitas, sin historial de eventos ni sync incremental.
 */
export const STEAM_MANIFEST: ProfileSourceManifest = {
  key: 'steam',
  name: 'Steam',
  categories: ['games'],
  authentication: 'openid',
  syncStrategy: 'scheduled',
  capabilities: {
    known: true,
    consumed: true,
    explicitRating: false,
    implicitPreference: true,
    history: false,
    incrementalSync: false,
  },
  availability: 'available',
  simulated: false,
  description:
    'Inicias sesión en Steam (OpenID) para vincular tu SteamID. APPINITY lee tu biblioteca y horas jugadas con la Steam Web API. No es OAuth y no recibe tu contraseña.',
};

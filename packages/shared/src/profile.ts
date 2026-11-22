import type { PreferenceBasis } from './observation.js';

/**
 * Perfil consolidado de un usuario sobre un objeto (§10). Known, Consumed y Preference son
 * independientes; NULL en la preferencia significa falta de evidencia, no rechazo.
 */
export interface UserItemProfile {
  userId: string;
  catalogItemId: string;
  knownConfidence: number;
  consumedConfidence: number;
  preferenceScore: number | null;
  preferenceConfidence: number | null;
  preferenceBasis: PreferenceBasis | null;
  evidenceCount: number;
  sourceCount: number;
  hasConflict: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  consolidationVersion: string;
}

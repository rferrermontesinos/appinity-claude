import { create } from 'zustand';
import { secureStorage } from './secure-storage';

const TOKEN_KEY = 'appinity.devSession';

export interface StoredSession {
  token: string;
  expiresAt: string;
  handle: string;
  /** Sesión de producción (fase 13): se renueva con el refresh token; la de desarrollo, no. */
  kind?: 'dev' | 'user';
  refreshToken?: string;
}

interface SessionState {
  hydrated: boolean;
  session: StoredSession | null;
  hydrate(): Promise<void>;
  setSession(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Sesión (de desarrollo o de producción) firmada por la API. Se guarda en el almacén seguro del sistema.
 * La app nunca recibe tokens de proveedores externos.
 */
export const useSession = create<SessionState>((set) => ({
  hydrated: false,
  session: null,
  async hydrate() {
    try {
      const raw = await secureStorage.get(TOKEN_KEY);
      const parsed = raw ? (JSON.parse(raw) as StoredSession) : null;
      // Una sesión de producción con refresh token sigue valiendo aunque el access token haya caducado (se renueva).
      const valid = parsed && (parsed.refreshToken || new Date(parsed.expiresAt).getTime() > Date.now() + 60_000) ? parsed : null;
      if (!valid && raw) await secureStorage.remove(TOKEN_KEY);
      set({ session: valid, hydrated: true });
    } catch {
      set({ session: null, hydrated: true });
    }
  },
  async setSession(session) {
    await secureStorage.set(TOKEN_KEY, JSON.stringify(session));
    set({ session });
  },
  async clear() {
    await secureStorage.remove(TOKEN_KEY);
    set({ session: null });
  },
}));

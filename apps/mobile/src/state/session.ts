import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const TOKEN_KEY = 'appinity.devSession';

interface StoredSession {
  token: string;
  expiresAt: string;
  handle: string;
}

interface SessionState {
  hydrated: boolean;
  session: StoredSession | null;
  hydrate(): Promise<void>;
  setSession(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Sesión de desarrollo (token firmado por la API). Se guarda en el almacén seguro del sistema.
 * La app nunca recibe tokens de proveedores externos.
 */
export const useSession = create<SessionState>((set) => ({
  hydrated: false,
  session: null,
  async hydrate() {
    try {
      const raw = await SecureStore.getItemAsync(TOKEN_KEY);
      const parsed = raw ? (JSON.parse(raw) as StoredSession) : null;
      const valid = parsed && new Date(parsed.expiresAt).getTime() > Date.now() + 60_000 ? parsed : null;
      if (!valid && raw) await SecureStore.deleteItemAsync(TOKEN_KEY);
      set({ session: valid, hydrated: true });
    } catch {
      set({ session: null, hydrated: true });
    }
  },
  async setSession(session) {
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(session));
    set({ session });
  },
  async clear() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ session: null });
  },
}));

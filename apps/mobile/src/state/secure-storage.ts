import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Almacén de la sesión de desarrollo. En iOS y Android usa el almacén seguro del sistema (SecureStore). En web
 * (solo para verificación durante el desarrollo, no es un objetivo del producto) recurre a localStorage.
 */
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Sin almacenamiento en este navegador: la sesión dura lo que la pestaña.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // Ignorado: no hay nada que borrar.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * PKCE entre la app y la API para «Continuar con Google» (RFC 7636, S256). El secreto se queda en el teléfono (o en
 * la pestaña, en la web) y solo viaja al canjear el código: quien intercepte la URL de vuelta no puede usarlo.
 */
const KEY = 'appinity.signin.pkce';

const base64url = (base64: string) => base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function save(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.sessionStorage.setItem(KEY, value);
    } catch {
      // Sin almacenamiento de sesión el canje fallará y la persona podrá reintentar.
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

/** Crea el secreto, lo guarda y devuelve el desafío (hash SHA-256 en base64url) para la URL de inicio. */
export async function createPkceChallenge(): Promise<string> {
  const verifier = base64url(bytesToBase64(Crypto.getRandomBytes(32)));
  await save(verifier);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  return base64url(digest);
}

/** Recupera el secreto y lo borra: sirve para un solo canje. */
export async function takePkceVerifier(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      const value = window.sessionStorage.getItem(KEY);
      window.sessionStorage.removeItem(KEY);
      return value;
    } catch {
      return null;
    }
  }
  const value = await SecureStore.getItemAsync(KEY);
  await SecureStore.deleteItemAsync(KEY);
  return value;
}

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de credenciales de proveedores con AES-256-GCM. Formato: `v1.<iv>.<tag>.<datos>` en base64url.
 * La clave (32 bytes en base64) vive en CREDENTIALS_ENCRYPTION_KEY, fuera de Git. Las credenciales
 * descifradas solo existen en memoria del backend o del worker.
 */
const VERSION = 'v1';

function loadKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY debe contener 32 bytes en base64');
  return key;
}

export function encryptCredentials(payload: Record<string, string>, base64Key: string, aad: string): string {
  const key = loadKey(base64Key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

/** `aad` vincula el cifrado a su conexión: un texto cifrado copiado a otra conexión no se descifra. */
export function decryptCredentials(ciphertext: string, base64Key: string, aad: string): Record<string, string> {
  const [version, iv, tag, data] = ciphertext.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Formato de credenciales cifradas desconocido');
  const decipher = createDecipheriv('aes-256-gcm', loadKey(base64Key), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as Record<string, string>;
}

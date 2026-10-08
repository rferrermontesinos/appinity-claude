import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Almacenamiento de objetos para imágenes cacheadas. En desarrollo, disco local; la interfaz permite cambiarlo
 * por un almacenamiento S3 compatible sin tocar el resto del código.
 */
export interface ObjectStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  exists(key: string): Promise<boolean>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,255}$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key) && !key.includes('..') && !key.includes('//') && !key.endsWith('/');
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export function extensionForMime(mime: string): string | null {
  const clean = mime.split(';')[0]!.trim().toLowerCase();
  const entry = Object.entries(CONTENT_TYPES).find(([, type]) => type === clean);
  return entry?.[0] ?? null;
}

export class LocalDiskStorage implements ObjectStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    if (!isValidStorageKey(key)) throw new Error(`Clave de almacenamiento no válida: ${key}`);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Clave fuera del almacenamiento');
    return full;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    try {
      const data = await readFile(this.pathFor(key));
      const ext = key.split('.').pop() ?? '';
      return { data, contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

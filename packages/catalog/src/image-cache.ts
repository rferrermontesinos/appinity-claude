import { catalogImages, type Database } from '@appinity/database';
import { eq, sql } from 'drizzle-orm';
import { extensionForMime, type ObjectStorage } from './storage.js';

export const IMAGE_FETCH_USER_AGENT =
  'appinity-claude/0.1 (desarrollo local; https://github.com/rferrermontesinos/appinity-claude)';

const MAX_BYTES = 8 * 1024 * 1024;

export type ImageCacheOutcome = 'cached' | 'already_cached' | 'failed' | 'missing' | 'not_cacheable';

/**
 * Orígenes cuya licencia permite guardar una copia. El arte de Steam (steam_cdn) y cualquier origen desconocido se
 * conservan solo como referencia: la app los carga del origen y, si fallan, usa el fallback.
 */
export const CACHEABLE_IMAGE_SOURCES = new Set(['wikimedia_commons']);

/**
 * Descarga la imagen de referencia y la guarda en el almacenamiento propio, cuando la licencia lo permite
 * (las imágenes de la demo son de Wikimedia Commons con licencias libres). Si falla, la tarjeta sigue usando la
 * URL de origen y, si esta también falla, la app muestra el fallback de la categoría.
 */
export async function cacheCatalogImage(
  db: Database,
  storage: ObjectStorage,
  imageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageCacheOutcome> {
  const [image] = await db.select().from(catalogImages).where(eq(catalogImages.id, imageId));
  if (!image) return 'missing';
  if (!CACHEABLE_IMAGE_SOURCES.has(image.source)) return 'not_cacheable';
  if (image.cacheStatus === 'cached' && image.storageKey && (await storage.exists(image.storageKey))) {
    return 'already_cached';
  }

  try {
    const response = await fetchImpl(image.url, {
      headers: { 'User-Agent': IMAGE_FETCH_USER_AGENT, Accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const mime = response.headers.get('content-type') ?? image.mime ?? '';
    const ext = extensionForMime(mime);
    if (!ext || ext === 'svg') throw new Error(`Tipo de contenido no admitido: ${mime || 'desconocido'}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error(`Imagen demasiado grande (${declared} bytes)`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > MAX_BYTES) throw new Error(`Tamaño no válido (${data.byteLength} bytes)`);

    const key = `catalog/${image.catalogItemId}/${image.id}.${ext}`;
    await storage.put(key, data, mime);
    await db
      .update(catalogImages)
      .set({ cacheStatus: 'cached', storageKey: key, mime: mime.split(';')[0]!, cacheError: null, fetchedAt: new Date(), updatedAt: sql`now()` })
      .where(eq(catalogImages.id, image.id));
    return 'cached';
  } catch (error) {
    await db
      .update(catalogImages)
      .set({ cacheStatus: 'failed', cacheError: (error as Error).message.slice(0, 300), updatedAt: sql`now()` })
      .where(eq(catalogImages.id, image.id));
    return 'failed';
  }
}

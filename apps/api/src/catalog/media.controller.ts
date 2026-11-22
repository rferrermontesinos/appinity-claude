import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import { isValidStorageKey, renderFallbackSvg, type ObjectStorage } from '@appinity/catalog';
import { isCategory } from '@appinity/shared';
import type { Response } from 'express';
import { Public } from '../common/public.decorator.js';
import { STORAGE } from '../infra/tokens.js';

/**
 * Imágenes del catálogo (públicas: no contienen datos personales). Las cacheadas se sirven desde el
 * almacenamiento propio; los fallbacks de categoría se generan como SVG.
 */
@Controller()
export class MediaController {
  constructor(@Inject(STORAGE) private readonly storage: ObjectStorage) {}

  @Public()
  @Get('media/*key')
  async media(@Param('key') key: string | string[], @Res() res: Response): Promise<void> {
    const path = Array.isArray(key) ? key.join('/') : key;
    if (!isValidStorageKey(path) || !path.startsWith('catalog/')) throw new NotFoundException();
    const object = await this.storage.get(path);
    if (!object) throw new NotFoundException();
    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(object.data);
  }

  @Public()
  @Get('static/fallback/:file')
  fallback(@Param('file') file: string, @Res() res: Response): void {
    const category = file.replace(/\.svg$/, '');
    if (!file.endsWith('.svg') || !isCategory(category)) throw new NotFoundException();
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(renderFallbackSvg(category));
  }
}

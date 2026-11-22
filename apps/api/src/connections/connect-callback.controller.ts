import { Controller, Get, Logger, Param, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/public.decorator.js';
import { ConnectionsService } from './connections.service.js';
import { withResult } from './return-url.js';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, message: string, returnUrl?: string): string {
  const link = returnUrl ? `<p><a href="${escapeHtml(returnUrl)}">Volver a APPINITY</a></p>` : '<p>Ya puedes volver a la app.</p>';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1c1a19}a{color:#5b3fd9}</style></head>
<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${link}</body></html>`;
}

/**
 * Vuelta del proveedor (navegador del teléfono). Pública porque el navegador no lleva la sesión de la app: la
 * autoriza el `state` de un solo uso creado al iniciar la conexión. Redirige a la app con el resultado.
 */
@Controller('v1/connect')
export class ConnectCallbackController {
  private readonly logger = new Logger('ConnectCallback');

  constructor(private readonly connections: ConnectionsService) {}

  @Public()
  @Get(':sourceKey/callback')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async callback(
    @Param('sourceKey') sourceKey: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const state = typeof query.state === 'string' ? query.state : '';
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) if (key.startsWith('openid.') && typeof value === 'string') params[key] = value;

    const returnUrl = state ? await this.connections.peekReturnUrl(state) : undefined;
    try {
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) throw new Error('Solicitud de conexión no válida');
      const outcome = await this.connections.completeCallback(sourceKey, state, params);
      if (outcome.returnUrl) {
        res.redirect(302, withResult(outcome.returnUrl, { source: sourceKey, result: 'connected' }));
        return;
      }
      res.status(200).type('html').send(page('Cuenta conectada', 'Tu cuenta se ha vinculado. La primera sincronización ya está en marcha.'));
    } catch (error) {
      const message = (error as Error).message.slice(0, 200);
      this.logger.warn(`Callback de ${sourceKey} rechazado: ${message}`);
      if (returnUrl) {
        res.redirect(302, withResult(returnUrl, { source: sourceKey, result: 'error', message }));
        return;
      }
      res.status(400).type('html').send(page('No se pudo conectar', message));
    }
  }
}

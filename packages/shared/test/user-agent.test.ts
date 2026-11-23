import { describe, expect, it } from 'vitest';
import { outboundContact, outboundUserAgent } from '../src/user-agent.js';

describe('User-Agent de las peticiones salientes (SEC-009)', () => {
  it('usa el contacto declarado del proyecto, como URL o como email', () => {
    expect(outboundUserAgent({ NODE_ENV: 'production', OUTBOUND_CONTACT: 'https://appinity.example' })).toBe('APPINITY/0.1 (+https://appinity.example)');
    expect(outboundContact({ NODE_ENV: 'production', OUTBOUND_CONTACT: 'soporte@appinity.example' })).toBe('mailto:soporte@appinity.example');
  });

  it('sin contacto declarado usa el origen https de PUBLIC_API_URL', () => {
    expect(outboundUserAgent({ NODE_ENV: 'production', PUBLIC_API_URL: 'https://api.appinity.example/base' })).toBe(
      'APPINITY/0.1 (+https://api.appinity.example)',
    );
  });

  it('en producción nunca envía el repositorio (lleva el usuario de GitHub del titular)', () => {
    const ua = outboundUserAgent({ NODE_ENV: 'production', PUBLIC_API_URL: 'http://localhost:3100' });
    expect(ua).toBe('APPINITY/0.1');
    expect(ua).not.toMatch(/github/);
  });

  it('en desarrollo conserva la página del repositorio como contacto', () => {
    expect(outboundUserAgent({ NODE_ENV: 'development' }, 'caché de imágenes')).toBe(
      'APPINITY/0.1 (caché de imágenes; +https://github.com/rferrermontesinos/appinity-claude)',
    );
  });

  it('ignora contactos que romperían la cabecera', () => {
    expect(outboundContact({ NODE_ENV: 'production', OUTBOUND_CONTACT: 'hola (mundo)', PUBLIC_API_URL: 'https://api.x.example' })).toBe(
      'https://api.x.example',
    );
    expect(outboundContact({ NODE_ENV: 'production', OUTBOUND_CONTACT: 'javascript:alert(1)' })).toBeNull();
  });
});

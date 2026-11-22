#!/usr/bin/env node
// Apunta la API a su URL pública (túnel de Cloudflare): PUBLIC_API_URL, las URL de vuelta de Google y de las demás
// fuentes, y TRUST_PROXY=loopback (cloudflared llega desde este equipo). Imprime lo que hay que registrar en Google Cloud.
// Uso: pnpm public-url https://api.tudominio.com   ·   Para volver a solo local: pnpm public-url --local
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const arg = process.argv[2];
const local = arg === '--local';
const LOCAL_BASE = 'http://localhost:3100';
let base = LOCAL_BASE;
if (!local) {
  let url;
  try {
    url = new URL(arg ?? '');
  } catch {
    console.error('Indica la URL pública con https, p. ej.: pnpm public-url https://api.tudominio.com');
    process.exit(1);
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.username) {
    console.error('La URL debe ser https y sin ruta ni parámetros (p. ej. https://api.tudominio.com).');
    process.exit(1);
  }
  base = url.origin;
}

const values = {
  PUBLIC_API_URL: local ? '' : base,
  GOOGLE_SIGNIN_REDIRECT_URI: `${base}/v1/auth/google/callback`,
  GOOGLE_BOOKS_REDIRECT_URI: `${base}/v1/connect/google_books/callback`,
  GOOGLE_OAUTH_REDIRECT_URI: `${base}/v1/connect/google_portability/callback`,
  TRAKT_REDIRECT_URI: `${base}/v1/connect/trakt/callback`,
  ANILIST_REDIRECT_URI: `${base}/v1/connect/anilist/callback`,
  FACEBOOK_REDIRECT_URI: `${base}/v1/connect/facebook/callback`,
  TRUST_PROXY: local ? '' : 'loopback',
};

const file = '.env';
if (!existsSync(file)) {
  console.error('No hay .env: ejecuta antes pnpm setup.');
  process.exit(1);
}
let text = readFileSync(file, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else text = `${text.replace(/\s*$/, '')}${eol}${line}${eol}`;
}
writeFileSync(file, text);

console.log(local ? 'API en modo solo local.' : `API publicada en ${base}.`);
console.log('Reinicia pnpm api y pnpm worker para aplicarlo.');
if (!local) {
  console.log('\nEn Google Cloud → Credenciales → tu cliente OAuth → «URIs de redireccionamiento autorizados», añade:');
  for (const key of ['GOOGLE_SIGNIN_REDIRECT_URI', 'GOOGLE_BOOKS_REDIRECT_URI', 'GOOGLE_OAUTH_REDIRECT_URI']) console.log(`  ${values[key]}`);
  console.log('(Deja también las de http://localhost:3100 para la vista web del PC.)');
}

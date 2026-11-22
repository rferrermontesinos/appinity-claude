#!/usr/bin/env node
// Diagnóstico local: servicios Docker, API por localhost y por IP de red, y URL configurada en el móvil.
// No modifica nada. Uso: pnpm doctor
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { lanCandidates, parseEnv } from './lib/network.mjs';

const root = new URL('../', import.meta.url);
const env = existsSync(new URL('.env', root)) ? parseEnv(readFileSync(new URL('.env', root), 'utf8')) : new Map();
const mobileEnv = existsSync(new URL('apps/mobile/.env', root))
  ? parseEnv(readFileSync(new URL('apps/mobile/.env', root), 'utf8'))
  : new Map();
const port = env.get('API_PORT') || '3100';

const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => console.log(`  ✕ ${msg}`);
const info = (msg) => console.log(`  · ${msg}`);

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.status === 200, status: res.status, body };
  } catch (error) {
    return { ok: false, error: error.cause?.code ?? error.message };
  }
}

console.log('\nConfiguración');
if (existsSync(new URL('.env', root))) ok('.env presente');
else bad('.env no existe: ejecuta pnpm setup');
const mobileUrl = mobileEnv.get('EXPO_PUBLIC_API_URL');
if (mobileUrl) ok(`EXPO_PUBLIC_API_URL=${mobileUrl}`);
else info('EXPO_PUBLIC_API_URL vacía: la app usará la IP de Metro + :3100');
if (mobileUrl && /localhost|127\.0\.0\.1/.test(mobileUrl)) bad('La URL del móvil usa localhost: en el teléfono apunta al propio teléfono');

console.log('\nServicios Docker (proyecto appinity-claude)');
try {
  const out = execFileSync('docker', ['compose', 'ps', '--format', '{{.Name}} {{.State}} {{.Health}}'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!out) bad('No hay contenedores: ejecuta pnpm services:up');
  for (const line of out.split('\n').filter(Boolean)) (line.includes('healthy') ? ok : bad)(line);
} catch (error) {
  bad(`docker compose no responde: ${error.message.split('\n')[0]}`);
}

console.log('\nAPI');
const local = await probe(`http://127.0.0.1:${port}/health`);
if (local.ok) ok(`http://127.0.0.1:${port}/health → ${local.body.status}`);
else bad(`http://127.0.0.1:${port}/health → ${local.status ?? local.error} (¿está arrancada con pnpm api o pnpm dev?)`);
if (local.body?.checks) {
  for (const [name, check] of Object.entries(local.body.checks)) {
    (check.ok ? ok : bad)(`${name}: ${check.ok ? 'OK' : check.detail}`);
  }
}

console.log('\nRed local (lo que verá el teléfono)');
const candidates = lanCandidates();
if (!candidates.length) bad('No se detectan IPv4 privadas: ¿está el PC conectado a la red?');
for (const c of candidates) {
  const res = await probe(`http://${c.address}:${port}/health`);
  const label = `${c.address} (${c.name})${c.virtual ? ' [virtual]' : ''}`;
  if (res.ok) ok(`${label} → API accesible en http://${c.address}:${port}`);
  else info(`${label} → ${res.status ?? res.error}`);
}

console.log('\nSi el teléfono no conecta');
info('Teléfono y PC en la misma red (Wi-Fi del móvil y Ethernet del PC al mismo router sirve).');
info('Sin "aislamiento de clientes" ni Wi-Fi de invitados en el router.');
info('Firewall de Windows: permitir Node.js en redes privadas, o una regla de entrada para los puertos');
info(`${port} (API) y 8091 (Metro). Debe hacerlo el usuario como administrador; ver README.`);
info('Prueba desde el navegador del teléfono: http://<IP-del-PC>:' + port + '/health');
console.log('');

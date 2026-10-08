#!/usr/bin/env node
// Prepara la configuración local: crea .env a partir de .env.example con secretos aleatorios
// y apps/mobile/.env con la URL de la API alcanzable desde el teléfono.
// Uso: pnpm setup [--ip 192.168.1.16]
// No sobrescribe valores ya presentes, salvo EXPO_PUBLIC_API_URL cuando se pasa --ip.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { lanCandidates, parseEnv } from './lib/network.mjs';

const root = new URL('../', import.meta.url);
const envPath = new URL('.env', root);
const envExamplePath = new URL('.env.example', root);
const mobileEnvPath = new URL('apps/mobile/.env', root);

const args = process.argv.slice(2);
const ipFlag = args.indexOf('--ip');
const forcedIp = ipFlag >= 0 ? args[ipFlag + 1] : undefined;

function setValue(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}

function main() {
  let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : readFileSync(envExamplePath, 'utf8');
  const current = parseEnv(env);
  const created = !existsSync(envPath);

  if (!current.get('DEV_AUTH_SECRET')) env = setValue(env, 'DEV_AUTH_SECRET', randomBytes(32).toString('base64url'));
  if (!current.get('CREDENTIALS_ENCRYPTION_KEY'))
    env = setValue(env, 'CREDENTIALS_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  writeFileSync(envPath, env, 'utf8');

  const candidates = lanCandidates();
  const ip = forcedIp ?? candidates[0]?.address;
  const port = parseEnv(env).get('API_PORT') || '3100';

  let mobileEnv = existsSync(mobileEnvPath) ? readFileSync(mobileEnvPath, 'utf8') : '';
  const mobileCurrent = parseEnv(mobileEnv).get('EXPO_PUBLIC_API_URL');
  if (ip && (forcedIp || !mobileCurrent)) {
    mobileEnv = setValue(mobileEnv || '# Generado por pnpm setup\n', 'EXPO_PUBLIC_API_URL', `http://${ip}:${port}`);
    writeFileSync(mobileEnvPath, mobileEnv, 'utf8');
  }

  console.log(created ? '✔ .env creado con secretos aleatorios' : '✔ .env existente conservado (solo se completan vacíos)');
  console.log('Interfaces IPv4 privadas detectadas:');
  for (const c of candidates) console.log(`  ${c.address.padEnd(16)} ${c.name}${c.virtual ? '  (virtual, el teléfono no suele alcanzarla)' : ''}`);
  const finalUrl = parseEnv(existsSync(mobileEnvPath) ? readFileSync(mobileEnvPath, 'utf8') : '').get('EXPO_PUBLIC_API_URL');
  console.log(`✔ apps/mobile/.env → EXPO_PUBLIC_API_URL=${finalUrl ?? '(sin definir)'}`);
  if (!ip) console.log('⚠ No se detectó IP de red local. Usa: pnpm setup --ip <IP-del-PC>');
}

main();

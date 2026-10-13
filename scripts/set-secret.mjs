#!/usr/bin/env node
// Guarda un secreto en .env sin mostrarlo en pantalla ni pasar por el chat.
// Uso (en TU terminal):
//   pnpm secret:set STEAM_WEB_API_KEY              → pide el valor (se muestran asteriscos)
//   pnpm secret:set STEAM_WEB_API_KEY --clipboard  → lo lee del portapapeles (copia la clave antes)
//   pnpm secret:set GOOGLE_OAUTH_CLIENT_ID --clipboard      → ID de cliente OAuth de Google (…apps.googleusercontent.com)
//   pnpm secret:set GOOGLE_OAUTH_CLIENT_SECRET --clipboard  → secreto del cliente OAuth de Google (empieza por GOCSPX-)
// Solo admite claves de la lista blanca; .env está ignorado por Git.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describeInvalid, sanitizeSecret } from './lib/secret-input.mjs';

const ALLOWED = {
  STEAM_WEB_API_KEY: { pattern: /^[0-9A-F]{32}$/i, description: '32 caracteres hexadecimales (0-9, A-F)', hexOnly: true },
  GOOGLE_OAUTH_CLIENT_ID: {
    pattern: /^[\w-]+\.apps\.googleusercontent\.com$/,
    description: 'el ID de cliente OAuth de Google, que termina en .apps.googleusercontent.com',
  },
  GOOGLE_OAUTH_CLIENT_SECRET: {
    pattern: /^GOCSPX-[A-Za-z0-9_-]{20,}$/,
    description: 'el secreto del cliente OAuth de Google, que empieza por GOCSPX-',
    hint: (value) =>
      value.endsWith('.apps.googleusercontent.com') ? 'Eso es el ID de cliente: guárdalo con GOOGLE_OAUTH_CLIENT_ID.' : undefined,
  },
};

const args = process.argv.slice(2).filter((a) => a !== '--');
const name = args.find((a) => !a.startsWith('--'));
const fromClipboard = args.includes('--clipboard');
if (!name || !(name in ALLOWED)) {
  console.error(`Uso: pnpm secret:set <${Object.keys(ALLOWED).join('|')}> [--clipboard]`);
  process.exit(1);
}
const envPath = new URL('../.env', import.meta.url);
if (!existsSync(envPath)) {
  console.error('No existe .env: ejecuta primero pnpm setup');
  process.exit(1);
}

function readClipboard() {
  try {
    if (process.platform === 'win32') {
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    }
    if (process.platform === 'darwin') return execFileSync('pbpaste', { encoding: 'utf8' });
  } catch {
    // Se informa abajo.
  }
  console.error('No se pudo leer el portapapeles en este sistema. Usa el modo interactivo o edita .env a mano.');
  process.exit(1);
}

function readHidden(prompt) {
  if (!process.stdin.isTTY) {
    console.error('Ejecuta este comando en una terminal interactiva, o usa --clipboard.');
    process.exit(1);
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = (chunk) => {
      // Un pegado llega como un bloque: se procesa entero y Enter solo cierra si ya hay contenido.
      for (const c of chunk) {
        if (c === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if ((c === '\r' || c === '\n') && sanitizeSecret(value).length > 0) return finish();
        if (c === '\u007f' || c === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += c;
        if (/[0-9A-Za-z]/.test(c)) process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

const { pattern, description, hexOnly = false, hint } = ALLOWED[name];
const raw = fromClipboard
  ? readClipboard()
  : await readHidden(`Pega el valor de ${name} y pulsa Enter (verás un * por carácter, no el valor): `);
const value = sanitizeSecret(raw);
if (!pattern.test(value)) {
  console.error(`El valor no tiene el formato esperado para ${name}. No se ha guardado nada.`);
  console.error(describeInvalid(value, description, { hexOnly }));
  const extra = hint?.(value);
  if (extra) console.error(extra);
  if (!fromClipboard) {
    console.error('Si al pegar no aparecieron asteriscos, prueba a pegar con clic derecho o usa:');
    console.error(`  pnpm secret:set ${name} --clipboard   (copia antes la clave al portapapeles)`);
  }
  process.exit(1);
}
let env = readFileSync(envPath, 'utf8');
const line = `${name}=${value}`;
env = new RegExp(`^${name}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${name}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}\n`;
writeFileSync(envPath, env, 'utf8');
console.log(`✔ ${name} guardada en .env (${value.length} caracteres). Reinicia pnpm api y pnpm worker.`);
if (fromClipboard) console.log('  Consejo: copia cualquier otro texto para que la clave no se quede en el portapapeles.');

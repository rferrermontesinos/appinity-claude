#!/usr/bin/env node
// Guarda un secreto en .env sin mostrarlo en pantalla ni pasar por el chat.
// Uso (en TU terminal): pnpm secret:set STEAM_WEB_API_KEY
// Solo admite claves de la lista blanca; .env está ignorado por Git.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ALLOWED = {
  STEAM_WEB_API_KEY: /^[0-9A-F]{32}$/i,
};

const name = process.argv[2];
if (!name || !(name in ALLOWED)) {
  console.error(`Uso: pnpm secret:set <${Object.keys(ALLOWED).join('|')}>`);
  process.exit(1);
}
const envPath = new URL('../.env', import.meta.url);
if (!existsSync(envPath)) {
  console.error('No existe .env: ejecuta primero pnpm setup');
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error('Ejecuta este comando en una terminal interactiva (el valor no se muestra mientras escribes).');
  process.exit(1);
}

function readHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (char) => {
      for (const c of char) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (c === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

const value = await readHidden(`Pega el valor de ${name} y pulsa Enter (no se mostrará): `);
if (!ALLOWED[name].test(value)) {
  console.error(`El valor no tiene el formato esperado para ${name}. No se ha guardado nada.`);
  process.exit(1);
}
let env = readFileSync(envPath, 'utf8');
const line = `${name}=${value}`;
env = new RegExp(`^${name}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${name}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}\n`;
writeFileSync(envPath, env, 'utf8');
console.log(`✔ ${name} guardada en .env (${value.length} caracteres). Reinicia pnpm api y pnpm worker.`);

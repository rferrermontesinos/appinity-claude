#!/usr/bin/env node
// Captura de la vista web (8092) con Edge/Chrome sin interfaz, por el protocolo DevTools (sin dependencias).
// Uso: node scripts/web-screenshot.mjs --out shot.png [--path /] [--demo "Laura"] [--light] [--wait 5000] [--log] [--reload] [--eval "expr"] [--width 412 --height 915]
// --demo pulsa en la pantalla inicial el botón cuyo texto contiene ese nombre (usuarios de la demo). Solo localhost.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? true) : def;
};
const out = arg('out', 'shot.png');
const base = 'http://localhost:8092';
const path = arg('path', '/');
const demo = arg('demo', null);
const width = Number(arg('width', 412));
const height = Number(arg('height', 915));
const light = process.argv.includes('--light');
const wait = Number(arg('wait', 5000));
const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!browser) throw new Error('No se encuentra Edge ni Chrome');

const port = 9333 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'appinity-shot-'));
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => undefined);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const log = [];
  const requests = new Map();
  const answered = new Set();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
    if (msg.method === 'Runtime.exceptionThrown') log.push('excepción: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 300));
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) log.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    if (msg.method === 'Network.requestWillBeSent' && msg.params.request.url.includes(':3100')) requests.set(msg.params.requestId, msg.params.request.method + ' ' + msg.params.request.url.replace(/^https?:\/\/[^/]+/, ''));
    if (msg.method === 'Network.responseReceived' && requests.has(msg.params.requestId)) {
      answered.add(msg.params.requestId);
      log.push('api ' + msg.params.response.status + ' ' + requests.get(msg.params.requestId));
    }
    if (msg.method === 'Network.loadingFailed' && requests.has(msg.params.requestId)) log.push('api FALLO ' + msg.params.errorText + ' ' + requests.get(msg.params.requestId));
  });
  const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  if (light) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: base + '/' });
  await sleep(6000);
  if (demo) {
    const clicked = await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button],button,div')].reverse().find(e => e.innerText && e.innerText.includes(${JSON.stringify(demo)}) && e.innerText.length < 200); if (!el) return false; el.click(); return true; })()`);
    if (!clicked) console.error('No se encontró el usuario de demo');
    await sleep(5000);
  }
  if (process.argv.includes('--reload')) {
    await send('Page.reload');
    await sleep(6000);
  }
  if (path !== '/') {
    // Carga completa de la ruta: la sesión queda guardada en el navegador tras entrar.
    await send('Page.navigate', { url: base + path });
    await sleep(6000);
  }
  await sleep(wait);
  const expr = arg('eval', null);
  if (expr) console.log('eval:', JSON.stringify(await evaluate(expr)));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`Captura: ${out}`);
  if (process.argv.includes('--log')) console.log(log.join('\n'));
  ws.close();
} finally {
  proc.kill();
}

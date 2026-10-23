#!/usr/bin/env node
// Captura de la vista web (8092) con Edge/Chrome sin interfaz, por el protocolo DevTools (sin dependencias).
// Uso: node scripts/web-screenshot.mjs --out shot.png [--path /] [--demo "Laura"] [--light] [--wait 5000] [--log] [--reload] [--eval "expr"] [--width 412 --height 915]
// --demo pulsa en la pantalla inicial el botón cuyo texto contiene ese nombre (usuarios de la demo). Solo localhost.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  if (light) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.enable');
  if (process.argv.includes('--log')) {
    await send('Runtime.enable');
    await send('Network.enable');
  }
  await send('Page.navigate', { url: base + '/' });
  await sleep(6000);
  if (demo) {
    // Sesión de demo creada por la API de desarrollo y guardada como la guarda la app (sin pulsar botones).
    const ok = await evaluate(`(async () => {
      const users = await fetch('http://localhost:3100/v1/dev/users').then((r) => r.json());
      const u = (users.users || users).find((x) => x.displayName.includes(${JSON.stringify(demo)}));
      if (!u) return false;
      const r = await fetch('http://localhost:3100/v1/dev/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: u.handle }) });
      const j = await r.json();
      localStorage.setItem('appinity.devSession', JSON.stringify({ token: j.token, expiresAt: j.expiresAt, handle: u.handle }));
      return r.ok;
    })()`);
    if (!ok) console.error('No se pudo crear la sesión de demo');
    await send('Page.navigate', { url: base + path });
    await sleep(6000);
  } else if (path !== '/') {
    await send('Page.navigate', { url: base + path });
    await sleep(6000);
  }
  if (process.argv.includes('--reload')) {
    await send('Page.reload');
    await sleep(6000);
  }
  // Emulación de móvil al final: activarla antes de cargar rompía la sesión guardada en las rutas directas.
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await sleep(Math.max(wait, 2500));
  const expr = arg('eval', null);
  if (expr) console.log('eval:', JSON.stringify(await evaluate(expr)));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`Captura: ${out}`);
  // --tabs "people.png:People,profile.png:Profile": más capturas en la MISMA sesión, pulsando la pestaña por su texto
  // (la API de desarrollo limita las sesiones a 10 por minuto).
  const tabs = arg('tabs', null);
  if (tabs) {
    for (const spec of String(tabs).split(',')) {
      const [file, label] = spec.split(':');
      const clicked = await evaluate(
        `(() => { const el = [...document.querySelectorAll('a,[role=tab],[role=button],[role=link]')].filter(e => e.innerText && e.innerText.includes(${JSON.stringify(label)})).sort((x, y) => x.innerText.length - y.innerText.length)[0]; if (!el) return false; el.click(); return true; })()`,
      );
      if (!clicked) console.error(`No se encontró la pestaña ${label}`);
      await sleep(Math.max(wait, 3000));
      const s = await send('Page.captureScreenshot', { format: 'png' });
      const target = join(dirname(out), file);
      writeFileSync(target, Buffer.from(s.result.data, 'base64'));
      console.log(`Captura: ${target}`);
    }
  }
  if (process.argv.includes('--log')) console.log(log.join('\n'));
  ws.close();
} finally {
  // Edge abre procesos hijos: se cierra el árbol entero (en Windows, proc.kill solo cerraba el padre y quedaban cientos
  // de procesos y perfiles de ~250 MB en %TEMP%, que llegaron a llenar el disco). Después se borra el perfil temporal.
  // En Windows el lanzador de Edge termina enseguida y sus hijos quedan sueltos: se cierran por la ruta del perfil.
  if (process.platform === 'win32') {
    const name = profile.split(/[\\/]/).pop();
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -match '${name}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
  }
  else proc.kill('SIGKILL');
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    // Si sigue bloqueado, Windows lo limpiará con el resto de %TEMP%.
  }
}

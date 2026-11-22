// Servidor estático mínimo para revisar la guía en el navegador (solo localhost). Uso: node docs/design/design-system/src/serve.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT ?? 8093);
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(root, path || 'index.html');
  if (!file.startsWith(root)) return void res.writeHead(403).end();
  try {
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(port, '127.0.0.1', () => console.log(`Guía de diseño en http://localhost:${port}`));

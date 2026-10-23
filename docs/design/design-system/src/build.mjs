// Incrusta el sprite de iconos en index.html, concept.html e icons.html (autosuficientes con file://).
// Uso: node docs/design/design-system/src/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..');
const sprite = readFileSync(join(out, 'sprite.svg.html'), 'utf8').trim();
for (const name of ['index', 'concept']) {
  const src = readFileSync(join(here, `${name}.src.html`), 'utf8');
  writeFileSync(join(out, `${name}.html`), src.replace('<!--SPRITE-->', sprite));
}
const ids = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
writeFileSync(
  join(out, 'icons.html'),
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>APPINITY · Iconos</title><link rel="stylesheet" href="styles.css"><script src="theme.js"></script>
<style>body{font-family:var(--font-body);background:var(--bg);color:var(--on-surface);padding:32px}h1{font:700 24px var(--font-display);margin-bottom:16px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}.it{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 6px 8px;display:flex;flex-direction:column;align-items:center;gap:8px}.it span{font:10px var(--font-mono);color:var(--subtle)}#themeSel{position:fixed;top:16px;right:16px}</style></head><body>
${sprite}
<select id="themeSel" aria-label="Tema"><option value="">Oscuro</option><option value="light">Claro</option></select>
<h1>Iconos (${ids.length}) · <a class="link" href="index.html">volver a la guía</a></h1><div class="g">${ids.map((id) => `<div class="it"><svg class="ico ico--lg"><use href="#${id}"/></svg><span>${id}</span></div>`).join('')}</div></body></html>`,
);
console.log(`ok: index.html, concept.html, icons.html (${ids.length} iconos)`);

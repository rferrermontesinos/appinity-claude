import type { Event, StackFrame } from '@sentry/core';

/**
 * Filtro de privacidad de los avisos de errores (fase B4). Se aplica a TODO evento antes de salir hacia Sentry:
 * - fuera la persona (`user`), la petición (cabeceras, cookies, cuerpo y query), las variables locales y el código
 *   fuente de los frames;
 * - en cualquier texto (mensajes, tags, extras y contextos): los valores de las consultas fallidas, emails, tokens y JWT,
 *   tokens de push, parámetros secretos de URL, IDs (UUID y SteamID), IPs, secretos largos y la carpeta personal
 *   (`C:\Users\<nombre>`, `/home/<nombre>`);
 * - las rutas de los ficheros, relativas al repositorio (las absolutas llevan el nombre de usuario del PC);
 * - las claves que suenan a secreto o dato personal (authorization, cookie, token, email…) se sustituyen enteras.
 * Es deliberadamente agresivo: un aviso con menos detalle es mejor que un dato personal en un tercero.
 */
const TEXT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Valores de una consulta fallida: Drizzle los pone en el mensaje («Failed query: … params: Ana,nota…»), y PostgreSQL y
  // JSON.parse citan el valor que no entienden. Pueden ser nombres, notas o mensajes de chat: fuera enteros.
  [/(\bparams: )[\s\S]*$/g, '$1[redacted]'],
  [/(invalid input (?:syntax|value) for (?:type )?[\w ]+: )"[^"]*"/gi, '$1"[redacted]"'],
  [/"(?:[^"\\]|\\.)*"(?:\.\.\.)? is not valid JSON/g, '"[redacted]" is not valid JSON'],
  // Carpeta personal en rutas de Windows, macOS y Linux (lleva el nombre de quien usa el PC).
  [/(?:file:\/\/\/?)?(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/\s'"`:]+/gi, '~'],
  [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [token]'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]'],
  [/\bya29\.[\w.-]+/g, '[token]'],
  [/(^|[^\w])1\/\/[\w.-]{20,}/g, '$1[token]'],
  [/(?:Exponent|Expo)PushToken\[[^\]]*\]/g, '[push-token]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g, '[email]'],
  [
    /([?&#](?:code|state|token|access_token|refresh_token|id_token|key|api_key|apikey|secret|client_secret|password|code_verifier|code_challenge|sig|signature|sentry_key)=)[^&#\s'"]+/gi,
    '$1[redacted]',
  ],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  [/\b7656119\d{10}\b/g, '[steam-id]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]'],
  [/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, '[ip]'],
  // Secretos sin forma conocida: hex de 32 o más (claves de Steam, hashes) y base64url de 40 o más.
  [/\b[0-9a-f]{32,}\b/gi, '[secret]'],
  [/[A-Za-z0-9_+-]{40,}={0,2}/g, '[secret]'],
];

const SENSITIVE_KEY =
  /authorization|cookie|token|secret|password|passwd|email|e-mail|credential|session|refresh|dsn|api[_-]?key|private|phone|address|contact|hash/i;
const MAX_TEXT = 2_000;
const MAX_DEPTH = 6;

export function scrubText(text: string): string {
  let out = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
  for (const [pattern, replacement] of TEXT_RULES) out = out.replace(pattern, replacement);
  return out;
}

/** Limpia cualquier valor (texto, lista u objeto) de forma recursiva; las claves sensibles se sustituyen enteras. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : scrubValue(item, depth + 1);
  return out;
}

/** Ruta relativa al repositorio (apps/…, packages/…, workers/…, node_modules/…) o solo el nombre del fichero. */
export function relativeFilename(path: string): string {
  if (/^(node|internal):/.test(path) || !/[\\/]/.test(path)) return path;
  const normalized = path.replace(/\\/g, '/').replace(/^file:\/\/\/?/, '');
  const inRepo = /(?:^|\/)((?:apps|packages|workers|node_modules)\/.*)$/.exec(normalized);
  if (inRepo) {
    // De node_modules basta la última aparición (pnpm anida rutas largas con el nombre del paquete y su versión).
    const lastModules = normalized.lastIndexOf('/node_modules/');
    return lastModules >= 0 ? normalized.slice(lastModules + 1) : inRepo[1]!;
  }
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function scrubFrame(frame: StackFrame): StackFrame {
  const clean: StackFrame = { ...frame };
  if (clean.filename) clean.filename = relativeFilename(clean.filename);
  if (clean.abs_path) clean.abs_path = relativeFilename(clean.abs_path);
  if (clean.module) clean.module = scrubText(clean.module);
  if (clean.function) clean.function = scrubText(clean.function);
  delete clean.vars;
  delete clean.pre_context;
  delete clean.context_line;
  delete clean.post_context;
  return clean;
}

/** Aplica el filtro a un evento de Sentry (se usa como `beforeSend`). Devuelve una copia. */
export function scrubEvent<E extends Event>(event: E): E {
  const clean: E = { ...event };
  delete clean.user;
  delete clean.request;
  delete clean.modules;
  delete clean.breadcrumbs;
  if (clean.message) clean.message = scrubText(clean.message);
  if (clean.logentry) clean.logentry = scrubValue(clean.logentry) as E['logentry'];
  if (clean.transaction) clean.transaction = scrubText(clean.transaction);
  if (clean.tags) clean.tags = scrubValue(clean.tags) as E['tags'];
  if (clean.extra) clean.extra = scrubValue(clean.extra) as E['extra'];
  if (clean.contexts) {
    // `trace` son identificadores aleatorios del SDK (Sentry los valida como hex); el resto se filtra.
    const { trace, ...rest } = clean.contexts;
    clean.contexts = { ...(scrubValue(rest) as E['contexts']), ...(trace ? { trace } : {}) };
  }
  if (clean.exception?.values) {
    clean.exception = {
      ...clean.exception,
      values: clean.exception.values.map((value) => ({
        ...value,
        ...(value.value ? { value: scrubText(value.value) } : {}),
        ...(value.stacktrace?.frames ? { stacktrace: { ...value.stacktrace, frames: value.stacktrace.frames.map(scrubFrame) } } : {}),
      })),
    };
  }
  return clean;
}

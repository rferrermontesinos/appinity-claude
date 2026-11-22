import { catalogExternalIds, catalogItems, type Database } from '@appinity/database';
import type { Dataset } from '@appinity/shared';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Sinopsis de la ficha («Sobre esto», 2026-10-27): el comienzo del artículo de Wikipedia de la obra, recortado a 3–4
 * frases. La descripción corta de Wikidata («Dúo musical español») se queda para la tarjeta.
 * - Licencia: texto de Wikipedia, CC BY-SA 4.0 (permite uso comercial con atribución y misma licencia); la ficha
 *   enseña «Wikipedia · CC BY-SA 4.0» con enlace al artículo.
 * - Se guarda en `metadata.summary` por idioma ({ es: { text, url }, en: … }); `metadata.summaryCheckedAt` evita volver
 *   a consultar un objeto ya revisado (también los que no tienen artículo).
 */
export const SUMMARY_LANGUAGES = ['es', 'en'] as const;
export type SummaryLanguage = (typeof SUMMARY_LANGUAGES)[number];
export interface WikipediaSummary {
  text: string;
  url: string;
}
export const SUMMARY_MAX_CHARS = 480;
const SUMMARY_MAX_SENTENCES = 4;
/** Caracteres de ancho cero (U+200B–U+200D, U+FEFF) que a veces trae el texto. */
const ZERO_WIDTH = new RegExp(`[${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200d)}${String.fromCharCode(0xfeff)}]`, 'g');

/** Abreviaturas que no terminan una frase («EE. UU.», «Dr.», «S. A.»…). */
const ABBREVIATION = /(?:^|[\s(])(?:[A-ZÁÉÍÓÚÑ]{1,2}|Sr|Sra|Dr|Dra|St|Mr|Mrs|Ms|Jr|vs|núm|aprox|ca|c)\.$/;

/**
 * 3–4 frases y como mucho `max` caracteres, cortando siempre al final de una frase. Si la primera frase ya es más
 * larga, se corta por palabra con «…».
 */
export function trimSummary(raw: string, max = SUMMARY_MAX_CHARS): string | null {
  const text = raw
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    // Paréntesis vacíos que deja el texto plano (enlaces de audio, plantillas): antes que la pronunciación.
    .replace(/\(\s*[,;]?\s*\)/g, '')
    // Pronunciación (AFI) al principio de muchos artículos: «(pronunciación en islandés: /…/; Reikiavik, 1965)».
    // Primero la forma con «;» (se conservan lugar y fecha); después la que ocupa todo el paréntesis.
    .replace(/\((?:pronunciaci[oó]n|pronunciad[oa]|pronunciation|pronounced)[^();]*;\s*/gi, '(')
    .replace(/\((?:pronunciaci[oó]n|pronunciad[oa]|pronunciation|pronounced)[^()]*?\)\s*/gi, '')
    .replace(/\(\s*\(/g, '(')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
  if (!text) return null;
  const sentences: string[] = [];
  let start = 0;
  const end = /[.!?…](?=\s+["«¿¡(]?[A-ZÁÉÍÓÚÑ0-9])/g;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const candidate = text.slice(start, m.index + 1);
    if (ABBREVIATION.test(candidate)) continue;
    sentences.push(candidate.trim());
    start = m.index + 1;
  }
  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);
  let out = '';
  for (const s of sentences.slice(0, SUMMARY_MAX_SENTENCES)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[\s,;:]+$/, '')}…`;
}

export interface SummaryClientOptions {
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const chunk = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** Cliente mínimo: artículo de cada QID (Wikidata) y su introducción en texto plano (Wikipedia, TextExtracts). */
export class WikipediaSummaries {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: SummaryClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async json(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchImpl(url, { headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await this.sleep(2_000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Wikimedia respondió HTTP ${response.status}`);
      return response.json();
    }
  }

  /** QID → idioma → sinopsis. Sin artículo en un idioma, ese idioma no aparece. */
  async summariesFor(qids: string[]): Promise<Map<string, Partial<Record<SummaryLanguage, WikipediaSummary>>>> {
    const titles = new Map<string, Partial<Record<SummaryLanguage, string>>>();
    for (const batch of chunk([...new Set(qids)], 50)) {
      const sites = SUMMARY_LANGUAGES.map((l) => `${l}wiki`).join('|');
      const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=${sites}&ids=${batch.join('|')}`;
      const data = (await this.json(url)) as { entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }> };
      for (const [qid, entity] of Object.entries(data.entities ?? {})) {
        const byLang: Partial<Record<SummaryLanguage, string>> = {};
        for (const lang of SUMMARY_LANGUAGES) {
          const title = entity.sitelinks?.[`${lang}wiki`]?.title;
          if (title) byLang[lang] = title;
        }
        titles.set(qid, byLang);
      }
      await this.sleep(200);
    }
    const out = new Map<string, Partial<Record<SummaryLanguage, WikipediaSummary>>>();
    for (const qid of qids) out.set(qid, {});
    for (const lang of SUMMARY_LANGUAGES) {
      const wanted = [...titles].flatMap(([qid, byLang]) => (byLang[lang] ? [[qid, byLang[lang]] as const] : []));
      for (const batch of chunk(wanted, 20)) {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exsentences=${SUMMARY_MAX_SENTENCES}&exlimit=20&redirects=1&titles=${encodeURIComponent(batch.map(([, t]) => t).join('|'))}`;
        const data = (await this.json(url)) as {
          query?: { normalized?: Array<{ from: string; to: string }>; redirects?: Array<{ from: string; to: string }>; pages?: Array<{ title: string; extract?: string; fullurl?: string; missing?: boolean }> };
        };
        const q = data.query ?? {};
        const follow = (title: string) => {
          let t = q.normalized?.find((n) => n.from === title)?.to ?? title;
          t = q.redirects?.find((r) => r.from === t)?.to ?? t;
          return t;
        };
        const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
        for (const [qid, title] of batch) {
          const page = pages.get(follow(title));
          const text = page?.extract ? trimSummary(page.extract) : null;
          if (page && text && !page.missing) out.get(qid)![lang] = { text, url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` };
        }
        await this.sleep(200);
      }
    }
    return out;
  }
}

export interface SummaryEnrichmentResult {
  candidates: number;
  withSummary: number;
}

/** Añade la sinopsis a los objetos con QID que aún no se han revisado (sin pisar el resto de metadatos). */
export async function enrichSummariesFromWikipedia(
  db: Database,
  client: WikipediaSummaries,
  options: { dataset?: Dataset; limit?: number } = {},
): Promise<SummaryEnrichmentResult> {
  const rows = await db
    .select({ itemId: catalogItems.id, qid: catalogExternalIds.externalId, metadata: catalogItems.metadata })
    .from(catalogItems)
    .innerJoin(catalogExternalIds, and(eq(catalogExternalIds.catalogItemId, catalogItems.id), eq(catalogExternalIds.provider, 'wikidata'), eq(catalogExternalIds.idType, 'entity')))
    .where(
      and(
        eq(catalogItems.dataset, options.dataset ?? 'live'),
        sql`${catalogExternalIds.externalId} ~ '^Q[0-9]+$'`,
        sql`NOT (${catalogItems.metadata} ? 'summaryCheckedAt')`,
      ),
    )
    .limit(options.limit ?? 500);
  if (!rows.length) return { candidates: 0, withSummary: 0 };
  const summaries = await client.summariesFor(rows.map((r) => r.qid));
  let withSummary = 0;
  for (const row of rows) {
    const summary = summaries.get(row.qid) ?? {};
    if (Object.keys(summary).length) withSummary++;
    await db
      .update(catalogItems)
      .set({ metadata: { ...(row.metadata ?? {}), summary, summaryCheckedAt: new Date().toISOString() }, updatedAt: new Date() })
      .where(eq(catalogItems.id, row.itemId));
  }
  return { candidates: rows.length, withSummary };
}

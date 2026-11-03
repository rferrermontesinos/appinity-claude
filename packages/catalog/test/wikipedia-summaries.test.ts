import { describe, expect, it } from 'vitest';
import { SUMMARY_MAX_CHARS, WikipediaSummaries, trimSummary } from '../src/wikipedia-summaries.js';

describe('sinopsis de Wikipedia (ficha)', () => {
  it('recorta a 4 frases como mucho, siempre al final de una frase', () => {
    const text = 'Uno es corto. Dos también. Tres sigue. Cuatro más. Cinco sobra.';
    expect(trimSummary(text)).toBe('Uno es corto. Dos también. Tres sigue. Cuatro más.');
  });

  it('respeta el límite de caracteres sin partir frases', () => {
    const long = `A${'a'.repeat(300)}. B${'b'.repeat(250)}.`;
    const out = trimSummary(long)!;
    expect(out).toBe(`A${'a'.repeat(300)}.`);
    expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
  });

  it('no corta en abreviaturas («EE. UU.», «Dr.»)', () => {
    expect(trimSummary('Es un grupo de EE. UU. Fue fundado en 1990 por el Dr. Pérez. Otra frase.', 70)).toBe('Es un grupo de EE. UU. Fue fundado en 1990 por el Dr. Pérez.');
  });

  it('una primera frase demasiado larga se corta por palabra con «…»', () => {
    const out = trimSummary(`Palabra ${'larga '.repeat(120)}fin.`)!;
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
  });

  it('limpia paréntesis vacíos y espacios que deja el texto plano', () => {
    expect(trimSummary('Merlí ( ) es una serie  de televisión .')).toBe('Merlí es una serie de televisión.');
    expect(trimSummary('   ')).toBeNull();
  });

  it('quita la pronunciación (AFI) del principio', () => {
    expect(trimSummary('Björk Guðmundsdóttir (pronunciación en islandés: /pjœr̥k/; (Reikiavik, 21 de noviembre de 1965), es una cantante islandesa.')).toBe(
      'Björk Guðmundsdóttir (Reikiavik, 21 de noviembre de 1965), es una cantante islandesa.',
    );
    expect(trimSummary('Rosalía (pronunciación: /rosaˈli.a/) es una cantante.')).toBe('Rosalía es una cantante.');
    expect(trimSummary('Billie Eilish (pronunciado /ˈaɪlɪʃ/; Los Ángeles, 2001), es cantante.\u200B')).toBe('Billie Eilish (Los Ángeles, 2001), es cantante.');
    // Con el hueco de un enlace de audio dentro.
    expect(trimSummary('Björk (pronunciación en islandés: /pjœr̥k/ ( ); (Reikiavik, 1965), es islandesa.')).toBe('Björk (Reikiavik, 1965), es islandesa.');
  });

  it('pide el artículo de cada QID y su introducción, siguiendo normalizaciones y redirecciones', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const body = url.includes('wikidata.org')
        ? { entities: { Q1: { sitelinks: { eswiki: { title: 'Merlí (serie)' }, enwiki: { title: 'Merlí' } } }, Q2: { sitelinks: {} } } }
        : url.includes('es.wikipedia.org')
          ? { query: { redirects: [{ from: 'Merlí (serie)', to: 'Merlí (serie de televisión)' }], pages: [{ title: 'Merlí (serie de televisión)', extract: 'Merlí es una serie de televisión. Se estrenó en 2015.', fullurl: 'https://es.wikipedia.org/wiki/Merl%C3%AD_(serie_de_televisi%C3%B3n)' }] } }
          : { query: { pages: [{ title: 'Merlí', missing: true }] } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const client = new WikipediaSummaries({ userAgent: 'test', fetchImpl, sleep: async () => undefined });
    const out = await client.summariesFor(['Q1', 'Q2']);
    expect(out.get('Q1')).toEqual({ es: { text: 'Merlí es una serie de televisión. Se estrenó en 2015.', url: 'https://es.wikipedia.org/wiki/Merl%C3%AD_(serie_de_televisi%C3%B3n)' } });
    expect(out.get('Q2')).toEqual({});
    expect(calls.some((u) => u.includes('exsentences=4') && u.includes('explaintext=1'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, resolveLanguage, resources } from '../src/index.js';

function flatKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? flatKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe('i18n', () => {
  it('es y en definen exactamente las mismas claves', () => {
    expect(flatKeys(resources.en.translation).sort()).toEqual(flatKeys(resources.es.translation).sort());
  });

  it('ningún texto queda vacío', () => {
    for (const lang of ['es', 'en'] as const) {
      const empty = flatKeys(resources[lang].translation).filter((key) => {
        const value = key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], resources[lang].translation);
        return typeof value !== 'string' || value.trim() === '';
      });
      expect(empty, lang).toEqual([]);
    }
  });

  it('elige el primer idioma soportado y cae en español', () => {
    expect(resolveLanguage(['fr-FR', 'en-GB'])).toBe('en');
    expect(resolveLanguage(['es_ES'])).toBe('es');
    expect(resolveLanguage(['de', null, undefined])).toBe(DEFAULT_LANGUAGE);
    expect(DEFAULT_LANGUAGE).toBe('es');
  });

  it('las ocho categorías tienen nombre en ambos idiomas', () => {
    expect(Object.keys(resources.es.translation.categories)).toHaveLength(8);
    expect(Object.keys(resources.en.translation.categories)).toHaveLength(8);
  });
});

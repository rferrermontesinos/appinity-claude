import { en } from './en.js';
import { es } from './es.js';
import type { TranslationResources } from './types.js';

export type { TranslationResources } from './types.js';

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'es';

export const resources: Record<SupportedLanguage, { translation: TranslationResources }> = {
  es: { translation: es },
  en: { translation: en },
};

export function resolveLanguage(candidates: ReadonlyArray<string | null | undefined>): SupportedLanguage {
  for (const candidate of candidates) {
    const code = candidate?.toLowerCase().split(/[-_]/)[0];
    if (code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)) return code as SupportedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

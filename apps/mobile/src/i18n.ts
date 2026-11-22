import { resolveLanguage, resources } from '@appinity/i18n';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/** Idioma inicial: el del sistema si está soportado (es, en); después manda el ajuste del usuario. */
export function initI18n() {
  if (i18n.isInitialized) return i18n;
  const language = resolveLanguage(getLocales().map((l) => l.languageCode));
  void i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

export default i18n;

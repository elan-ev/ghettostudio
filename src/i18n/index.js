import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import deTranslations from './locales/de.json';
import elTranslations from './locales/el.json';
import esTranslations from './locales/es.json';
import faTranslations from './locales/fa.json';
import frTranslations from './locales/fr.json';
import nlTranslations from './locales/nl.json';
import trTranslations from './locales/tr.json';

const resources = {
  en: { translation: enTranslations },
  de: { translation: deTranslations },
  el: { translation: elTranslations },
  es: { translation: esTranslations },
  fa: { translation: faTranslations },
  fr: { translation: frTranslations },
  nl: { translation: nlTranslations },
  tr: { translation: trTranslations }
};

i18n
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    resources,
    fallbackLng: 'en',

    keySeparator: false,

    interpolation: {
      escapeValue: false
    },

    detection: {
      order: ['localStorage', 'navigator'],
    }
  });

export default i18n;

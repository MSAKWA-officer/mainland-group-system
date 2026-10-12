import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Inapakia kila faili la locales/<lang>/<namespace>.json moja kwa moja
const modules = import.meta.glob('./locales/*/*.json', { eager: true });
const resources = {};
for (const path in modules) {
  const [, lng, ns] = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  (resources[lng] ??= {})[ns] = modules[path].default;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'sw', 'zh'],
    nonExplicitSupportedLngs: true,
    ns: Object.keys(resources.en),
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'], lookupLocalStorage: 'mainland_lang' },
    debug: import.meta.env.DEV, // inaonyesha keys zinazokosekana kwenye console
  });

i18n.on('languageChanged', (l) => { document.documentElement.lang = l; });

export default i18n;
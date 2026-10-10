import i18n from '../i18n';

// Locale ya tarehe/namba kulingana na lugha iliyochaguliwa
const LOCALES = { en: 'en-GB', sw: 'sw-TZ', zh: 'zh-CN' };

export const currentLocale = () => LOCALES[i18n.resolvedLanguage] || 'en-GB';

// Mfano: fmtDate('2026-10-03') -> "3 Oktoba 2026" / "3 October 2026" / "2026年10月3日"
export const fmtDate = (d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  d ? new Date(d).toLocaleDateString(currentLocale(), opts) : '';
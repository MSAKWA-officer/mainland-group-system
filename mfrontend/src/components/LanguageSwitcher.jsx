import { useTranslation } from 'react-i18next';

const LANGS = [['en', 'English'], ['sw', 'Kiswahili'], ['zh', '中文']];

export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation();
  return (
    <select aria-label="Language" value={i18n.resolvedLanguage}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className={`rounded-md border border-slate-300 bg-white px-2 py-1 text-sm ${className}`}>
      {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
    </select>
  );
}
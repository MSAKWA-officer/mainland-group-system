import { useTranslation } from 'react-i18next';

// Shared labels for stock documents (status, direction, row actions). Text lives in i18n/locales/<lang>/docs.json.
// STATUS in features/stock/StockList.jsx is kept (English) only for modules not yet translated.
export function useDocText() {
  const { t } = useTranslation('docs');
  return {
    t,
    status: (s) => t(`status.${s}`, { defaultValue: s }),
    direction: (d) => t(`direction.${d}`, { defaultValue: d }),
  };
}

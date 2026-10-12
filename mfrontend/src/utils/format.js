import { currentLocale } from './locale';

export const fmt = (d) => (d ? new Date(d).toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// Namba / fedha kwa locale ya lugha iliyochaguliwa. Fedha zinaonyeshwa bila senti (TZS).
export const fmtNum = (v, max = 0) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: max }).format(Number(v) || 0);
export const fmtMoney = (v, currency = 'TZS') => {
  try { return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(v) || 0); }
  catch { return `${currency} ${fmtNum(v)}`; }
};

import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { currentLocale } from '../../utils/locale';

// Small display helpers shared by the Sales register, Cash sales and Credit sales screens.
// Maandishi yote yanatoka locales/<lugha>/sales.json (namespace 'sales').

// Banners keep their light background but their text is black.
export const NOTICE = '[&>div]:!text-black';
export const money = (v) => Number(v || 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(currentLocale(), { dateStyle: 'medium' }) : '—');

// Translate a code (e.g. status.DRAFT). Unknown codes are shown as they are.
const tr = (group, key) => i18n.t(`${group}.${key}`, { ns: 'sales', defaultValue: key });

// STATUS / PAY / TYPE keep the old shape: STATUS[code] = [label, dotColour] (also works with `const [label, dot] = STATUS[code]`).
// The label is looked up when it is read, so it always follows the selected language, also in Cash sales / Credit sales.
const entry = (group, key, dot) => ({
  get 0() { return tr(group, key); },
  1: dot,
  length: 2,
  *[Symbol.iterator]() { yield tr(group, key); yield dot; },
});
const dots = (group, map) => Object.fromEntries(Object.entries(map).map(([k, dot]) => [k, entry(group, k, dot)]));

export const STATUS = dots('status', {
  DRAFT: 'bg-slate-400', SUBMITTED: 'bg-amber-500', COMPLETED: 'bg-emerald-600',
  REJECTED: 'bg-red-500', CANCELLED: 'bg-slate-400', VOIDED: 'bg-red-500',
});
export const PAY = dots('pay', { UNPAID: 'bg-red-500', PARTIAL: 'bg-amber-500', PAID: 'bg-emerald-600' });
export const TYPE = dots('type', { CASH: 'bg-emerald-600', CREDIT: 'bg-indigo-600' });

// METHOD[code] still returns a string, now translated when read.
export const METHOD = {};
['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE'].forEach((k) => Object.defineProperty(METHOD, k, { enumerable: true, get: () => tr('method', k) }));

const Dot = ({ map, value }) => {
  useTranslation('sales');                                  // re-render when the language changes
  const [label, dot] = map[value] || [value, 'bg-slate-400'];
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</span>;
};
export const Status = ({ status }) => <Dot map={STATUS} value={status} />;
export const SaleType = ({ type }) => <Dot map={TYPE} value={type} />;
export const PayStatus = ({ status }) => <Dot map={PAY} value={status} />;

// Who the sale is for: a registered customer, or the walk-in name typed at the till.
export const customerName = (s) => s.customer?.name || s.walkInName || i18n.t('walkIn', { ns: 'sales' });

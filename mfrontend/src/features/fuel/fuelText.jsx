// Translated helpers for the Fuel balances / Fuel reports screens (text lives in i18n/locales/<lang>/fuel.json).
// The older shared file fuelUi.jsx is left as it is, because Drivers, Vehicles, Fuel funding and Fuel usage still use it.
import { useTranslation } from 'react-i18next';
import { fmtNum } from '../../utils/format';

const DOT = { ACTIVE: 'bg-emerald-600', VOIDED: 'bg-red-500', UNUSED: 'bg-amber-500', PARTIAL: 'bg-amber-500', SETTLED: 'bg-emerald-600', INACTIVE: 'bg-slate-400', PENDING: 'bg-amber-500', APPROVED: 'bg-emerald-600', REJECTED: 'bg-red-500' };

export const qty = (v, dp = 2) => fmtNum(v, dp);

export function useFuelText() {
  const { t } = useTranslation('fuel');
  return {
    t,
    litres: (v) => t('unit.litres', { value: qty(v, 3) }),
    km: (v) => t('unit.km', { value: qty(v, 1) }),
    days: (n) => t('unit.days', { count: Number(n) || 0 }),
    fuelType: (c) => t(`fuelType.${c}`, { defaultValue: c }),
    dash: (v, fn = qty) => (v == null || v === '' ? '—' : fn(v)),
  };
}

// Status as black text with a coloured dot; the label follows the selected language.
export function StateDot({ value }) {
  const { t } = useTranslation('fuel');
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${DOT[value] || 'bg-slate-400'}`} />{t(`state.${value}`, { defaultValue: value })}</span>;
}

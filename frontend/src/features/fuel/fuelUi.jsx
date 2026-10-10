// Small display pieces and helpers shared by Fuel usage, Fuel balances, Fuel reports, Drivers, Vehicles and Fuel funding.
// Maandishi yote yanatoka locales/<lugha>/fuel.json (namespace 'fuel').
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { currentLocale } from '../../utils/locale';
import { driverApi, fuelBalanceApi, vehicleApi } from '../../api/index.js';
import useLoad from '../../utils/useLoad';

export { NOTICE, money, day, Row, Stat, PagerBar, today, IconBtn, TONES, askReason, PageHead, toCents, fromCents, METHOD, NEEDS_BANK, AccountSelect, accountLabel, useAccounts, TXN_LABEL } from '../banking/bankingUi.jsx';

export const qty = (v, dp = 2) => Number(v || 0).toLocaleString(currentLocale(), { minimumFractionDigits: 0, maximumFractionDigits: dp });
export const litres = (v) => `${qty(v, 3)} L`;
export const km = (v) => `${qty(v, 1)} km`;
export const dash = (v, fn = qty) => (v == null || v === '' ? '—' : fn(v));

// Translate a code (e.g. fuelType.DIESEL). Unknown codes are shown as they are.
const tr = (group, key) => i18n.t(`${group}.${key}`, { ns: 'fuel', defaultValue: key });

// FUEL_TYPE[code] still returns a string, now translated when it is read (so it follows the selected language).
const lookup = (group, keys) => {
  const o = {};
  keys.forEach((k) => Object.defineProperty(o, k, { enumerable: true, get: () => tr(group, k) }));
  return o;
};
export const FUEL_TYPE = lookup('fuelType', ['DIESEL', 'PETROL', 'GAS', 'OTHER']);
export const VEHICLE_TYPE = lookup('vehicleType', ['TRUCK', 'PICKUP', 'VAN', 'CAR', 'MOTORCYCLE', 'OTHER']);
export const LICENSE_STATUS = lookup('licenseStatus', ['VALID', 'EXPIRING_SOON', 'EXPIRED']);

// Status as black text with a coloured dot (same look as the other screens). Labels come from fuel.json -> status.<CODE>.
const DOTS = {
  ACTIVE: 'bg-emerald-600', VOIDED: 'bg-red-500',
  UNUSED: 'bg-amber-500', PARTIAL: 'bg-amber-500', SETTLED: 'bg-emerald-600',
  INACTIVE: 'bg-slate-400',
  PENDING: 'bg-amber-500', APPROVED: 'bg-emerald-600', REJECTED: 'bg-red-500',
  VALID: 'bg-emerald-600', EXPIRING_SOON: 'bg-amber-500', EXPIRED: 'bg-red-500',
};
export const FuelDot = ({ value }) => {
  const { t } = useTranslation('fuel');
  const dot = DOTS[value] || 'bg-slate-400';
  const label = DOTS[value] ? t(`status.${value}`) : value;
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{label}</span>;
};

// Drivers and vehicles carry a plain isActive flag.
export const ActiveDot = ({ active }) => <FuelDot value={active ? 'ACTIVE' : 'INACTIVE'} />;

// One line that describes a funding in a drop-down.
export const fundingLabel = (b) => i18n.t('fundingLabel', {
  ns: 'fuel', no: b.fundingNo, plate: b.plateNo, driver: b.driverName,
  balance: Number(b.balance).toLocaleString(currentLocale(), { minimumFractionDigits: 2 }),
});
export const fundingOption = (b) => ({ ...b, label: fundingLabel(b) });

// Vehicles / drivers that have approved fuel funding, for filter drop-downs. Quietly empty if the user cannot read balances.
const options = (groupBy) => () => fuelBalanceApi.summary({ groupBy }).then((r) => r.rows.map(({ id, label }) => ({ id, label }))).catch(() => []);
export const useVehicleOptions = () => useLoad(options('vehicle'), []);
export const useDriverOptions = () => useLoad(options('driver'), []);

// Every vehicle / driver (up to 100) for the Fuel funding filters, including ones that have no approved funding yet. Quietly empty without drivers.read / vehicles.read.
export const useAllVehicles = () => useLoad(() => vehicleApi.list({ limit: 100 }).then((r) => r.data.map(({ id, plateNo }) => ({ id, label: plateNo }))).catch(() => []), []);
export const useAllDrivers = () => useLoad(() => driverApi.list({ limit: 100 }).then((r) => r.data.map(({ id, fullName }) => ({ id, label: fullName }))).catch(() => []), []);

export const OptionSelect = ({ options: list, value, onChange, all, label }) => (
  <select className="input max-w-[14rem]" aria-label={label} value={value} onChange={onChange}>
    <option value="">{all}</option>
    {(list || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
  </select>
);

// Table look shared by the fuel lists and reports: Arial 14px, 1px light-grey grid, ~39px rows, first column left, rest centred.
export const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
export const HEAD = `${CELL} bg-white font-semibold uppercase`;
export const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export const Th = ({ children, right }) => <th className={`th px-6 py-3 font-normal uppercase text-black ${right ? 'text-right' : ''}`}>{children}</th>;

// Pickers for the Fuel funding / Vehicle forms: active drivers and vehicles by search text. Users without drivers.read / vehicles.read just get an empty list.
export const driverOption = (d) => ({ ...d, label: `${d.fullName} (${d.code})${d.licenseStatus === 'EXPIRED' ? ` · ${i18n.t('licenceExpired', { ns: 'fuel' })}` : ''}` });
export const vehicleOption = (v) => ({ ...v, label: [v.plateNo, [v.make, v.model].filter(Boolean).join(' '), FUEL_TYPE[v.fuelType] || v.fuelType].filter(Boolean).join(' · ') });

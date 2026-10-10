// Pieces shared by Fuel reports (list), Fuel report (view), and the Generate / Change parameters forms.
import { useTranslation } from 'react-i18next';
import { fuelReportApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';
import { CELL, HEAD, al, NOTICE, OptionSelect, Stat, money, useDriverOptions, useVehicleOptions } from '../fuel/fuelUi.jsx';
import { qty, useFuelText } from '../fuel/fuelText.jsx';

export const TYPES = ['consumption', 'reconciliation', 'monthly'];
// Which filters each report understands (the API ignores nothing it does not know, so only these are sent).
export const KEYS = { consumption: ['from', 'to', 'vehicleId'], reconciliation: ['groupBy', 'from', 'to'], monthly: ['year', 'vehicleId', 'driverId'] };
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i);
export const DEFAULTS = { from: '', to: '', vehicleId: '', driverId: '', groupBy: 'vehicle', year: String(THIS_YEAR) };

// Only the filters of this report that actually have a value.
export const pick = (type, f) => Object.fromEntries(KEYS[type].filter((k) => f[k] !== undefined && f[k] !== '').map((k) => [k, f[k]]));
export const toQuery = (type, f) => new URLSearchParams(pick(type, f)).toString();
export const fromQuery = (type, sp) => ({ ...DEFAULTS, ...Object.fromEntries(KEYS[type].filter((k) => sp.get(k)).map((k) => [k, sp.get(k)])) });

const inputCls = 'input w-auto !text-[14px] !text-[#212121]';

// The filter fields of one report. Used live on the list page and inside the Generate / Change parameters forms.
export function ReportFilters({ type, value, onChange }) {
  const { t } = useTranslation('fuelReports');
  const vehicles = useVehicleOptions(); const drivers = useDriverOptions();
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const given = type === 'reconciliation';
  return (
    <div className="flex flex-wrap items-center gap-3">
      {type === 'reconciliation' && (
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('params.groupBy')} value={value.groupBy} onChange={set('groupBy')}>
          <option value="vehicle">{t('params.byVehicle')}</option><option value="driver">{t('params.byDriver')}</option>
        </select>
      )}
      {type === 'monthly' && (
        <select className="input max-w-[8rem] !text-[14px] !text-[#212121]" aria-label={t('params.year')} value={value.year} onChange={set('year')}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
      )}
      {KEYS[type].includes('vehicleId') && <OptionSelect label={t('params.filterVehicle')} all={t('params.allVehicles')} options={vehicles.data} value={value.vehicleId} onChange={set('vehicleId')} />}
      {KEYS[type].includes('driverId') && <OptionSelect label={t('params.filterDriver')} all={t('params.allDrivers')} options={drivers.data} value={value.driverId} onChange={set('driverId')} />}
      {KEYS[type].includes('from') && (<>
        <label className="flex items-center gap-2 text-[14px]">{given ? t('params.givenFrom') : t('params.from')} <input type="date" className={inputCls} value={value.from} max={value.to || undefined} onChange={set('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{given ? t('params.givenTo') : t('params.to')} <input type="date" className={inputCls} value={value.to} min={value.from || undefined} onChange={set('to')} /></label>
      </>)}
    </div>
  );
}

// One line that says which filters a report was run with (used on the report's own page).
export function ParamSummary({ type, params }) {
  const { t } = useTranslation('fuelReports');
  const vehicles = useVehicleOptions(); const drivers = useDriverOptions();
  const label = (list, id) => (list.data || []).find((o) => o.id === id)?.label || id;
  const parts = KEYS[type].filter((k) => params[k]).map((k) => {
    if (k === 'vehicleId') return `${t('params.vehicle')}: ${label(vehicles, params[k])}`;
    if (k === 'driverId') return `${t('params.driver')}: ${label(drivers, params[k])}`;
    if (k === 'groupBy') return `${t('params.groupBy')}: ${t(params[k] === 'driver' ? 'params.byDriver' : 'params.byVehicle')}`;
    if (k === 'year') return `${t('params.year')}: ${params[k]}`;
    return `${t(k === 'from' ? (type === 'reconciliation' ? 'params.givenFrom' : 'params.from') : (type === 'reconciliation' ? 'params.givenTo' : 'params.to'))}: ${params[k]}`;
  });
  return <p className="text-[14px]">{parts.length ? parts.join(' · ') : t('params.none')}</p>;
}

const Table = ({ heads, children }) => (
  <div className="overflow-x-auto px-4 pb-4">
    <table className="w-full border-collapse bg-white">
      <thead><tr>{heads.map((h, i) => <th key={`${h}${i}`} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
const Empty = ({ cols, children }) => <tr><td className={`${CELL} text-left`} colSpan={cols}>{children}</td></tr>;
const Err = ({ children }) => (children ? <div className={`px-4 ${NOTICE}`}><Banner>{children}</Banner></div> : null);

// Litres, cost and efficiency per vehicle. Efficiency (km per litre) uses full-tank fills with odometer readings only.
function Consumption({ params }) {
  const { t } = useTranslation('fuelReports'); const ft = useFuelText();
  const q = useLoad(() => fuelReportApi.consumption(params), [JSON.stringify(params)]);
  const rows = q.data?.rows || []; const tot = q.data?.totals;
  const heads = ['vehicle', 'fills', 'litres', 'spent', 'avgPrice', 'distance', 'kmPerLitre', 'lPer100', 'costPerKm'].map((k) => t(`heads.${k}`));
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
      <Stat label={t('stats.spent')} value={money(tot?.amount)} /><Stat label={t('stats.litres')} value={ft.litres(tot?.litres)} /><Stat label={t('stats.fills')} value={tot?.fills ?? 0} />
    </div>
    <Err>{q.error}</Err>
    <Table heads={heads}>
      {!q.loading && rows.length === 0 && <Empty cols={heads.length}>{t('empty.consumption')}</Empty>}
      {rows.map((r) => (
        <tr key={r.id} className="bg-white">
          <td className={`${CELL} text-left`}>{r.plateNo}<div className="text-xs">{ft.fuelType(r.fuelType)}</div></td>
          <td className={`${CELL} text-center`}>{r.fills}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{qty(r.litres, 3)}</td>
          <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{money(r.amount)}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{ft.dash(r.avgPricePerLitre, money)}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.distanceKm) > 0 ? ft.km(r.distanceKm) : '—'}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{ft.dash(r.kmPerLitre)}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{ft.dash(r.litresPer100Km)}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{ft.dash(r.costPerKm, money)}</td>
        </tr>
      ))}
    </Table>
    <p className="px-4 pb-4 text-xs">{t('note')}</p>
  </>);
}

// Money given vs money spent vs money still unspent, per vehicle or per driver. Fundings are picked by the date the money was given out.
function Reconciliation({ params }) {
  const { t } = useTranslation('fuelReports'); const ft = useFuelText();
  const q = useLoad(() => fuelReportApi.reconciliation(params), [JSON.stringify(params)]);
  const rows = q.data?.rows || []; const tot = q.data?.totals;
  const heads = [params.groupBy === 'driver' ? 'driver' : 'vehicle', 'fundings', 'withMoneyLeft', 'funded', 'spent', 'unspent', 'usedPct', 'litresBought'].map((k) => t(`heads.${k}`));
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
      <Stat label={t('stats.funded')} value={money(tot?.funded)} /><Stat label={t('stats.spent')} value={money(tot?.used)} />
      <Stat label={t('stats.unspent')} value={money(tot?.balance)} tone={Number(tot?.balance) > 0 ? 'text-red-600' : ''} /><Stat label={t('stats.used')} value={`${tot?.usedPercent ?? 0}%`} />
    </div>
    <Err>{q.error}</Err>
    <Table heads={heads}>
      {!q.loading && rows.length === 0 && <Empty cols={heads.length}>{t('empty.reconciliation')}</Empty>}
      {rows.map((r) => (
        <tr key={r.id} className="bg-white">
          <td className={`${CELL} text-left`}>{r.label}</td>
          <td className={`${CELL} text-center`}>{r.fundings}</td>
          <td className={`${CELL} text-center`}>{r.openFundings}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.funded)}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.used)}</td>
          <td className={`${CELL} whitespace-nowrap text-center ${Number(r.balance) > 0 ? '!text-red-600' : ''}`}>{money(r.balance)}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{r.usedPercent ?? 0}%</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{ft.litres(r.usedLitres)}</td>
        </tr>
      ))}
    </Table>
  </>);
}

// Month-by-month totals for one year: money given out, money spent, litres bought and the average price per litre.
function Monthly({ params }) {
  const { t } = useTranslation('fuelReports'); const ft = useFuelText();
  const q = useLoad(() => fuelReportApi.monthly(params), [JSON.stringify(params)]);
  const rows = q.data?.rows || []; const tot = q.data?.totals;
  const max = Math.max(1, ...rows.map((r) => Number(r.used)));
  const heads = ['month', 'funded', 'spent', '', 'litres', 'fills', 'avgPrice'].map((k) => (k ? t(`heads.${k}`) : ''));
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
      <Stat label={t('stats.funded')} value={money(tot?.funded)} /><Stat label={t('stats.spent')} value={money(tot?.used)} />
      <Stat label={t('stats.litres')} value={ft.litres(tot?.litres)} /><Stat label={t('stats.avgPrice')} value={ft.dash(tot?.avgPricePerLitre, money)} />
    </div>
    <Err>{q.error}</Err>
    <Table heads={heads}>
      {rows.map((r) => (
        <tr key={r.period} className="bg-white">
          <td className={`${CELL} whitespace-nowrap text-left`}>{new Date(`${r.period}-01T00:00:00`).toLocaleDateString(currentLocale(), { month: 'long' })}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.funded) > 0 ? money(r.funded) : '—'}</td>
          <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{Number(r.used) > 0 ? money(r.used) : '—'}</td>
          <td className={`${CELL} w-40 text-center`}><div className="h-2 rounded bg-brand" style={{ width: `${(Number(r.used) / max) * 100}%` }} role="presentation" /></td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.litres) > 0 ? ft.litres(r.litres) : '—'}</td>
          <td className={`${CELL} text-center`}>{r.fills || '—'}</td>
          <td className={`${CELL} whitespace-nowrap text-center`}>{ft.dash(r.avgPricePerLitre, money)}</td>
        </tr>
      ))}
    </Table>
  </>);
}

export const ReportBody = ({ type, params }) => ({ consumption: <Consumption params={params} />, reconciliation: <Reconciliation params={params} />, monthly: <Monthly params={params} /> }[type] || null);

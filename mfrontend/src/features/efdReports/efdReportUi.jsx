import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { efdReportApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';
import { NOTICE, Stat, day, money, tzToday } from '../efdReconciliations/reconUi.jsx';
import { CELL, HEAD, al } from '../../components/TableUi.js';

export { NOTICE, Stat, day, money, tzToday, CELL, HEAD, al };

export const MAX_DAYS = 366;

export const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const span = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

export const initialPeriod = () => { const t = tzToday(); return { from: `${t.slice(0, 8)}01`, to: t }; };      // this month so far

// `t` is the translate function of the efdReports namespace.
export const periodError = (f, t) => (!f.from || !f.to ? t('errors.chooseBoth') : f.from > f.to ? t('errors.fromAfterTo') : span(f.from, f.to) > MAX_DAYS ? t('errors.maxDays', { max: MAX_DAYS }) : '');

// "January" / "Januari" / "1月", in the language chosen by the user (the server only sends the English name).
export const monthName = (year, month) => new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString(currentLocale(), { month: 'long', timeZone: 'UTC' });

// Loads one report and knows how to download it as CSV. `params` is re-sent whenever it changes; `err` (e.g. a bad period) blocks the request.
export function useEfdReport(name, params, err = '') {
  const q = useLoad(() => (err ? Promise.resolve(null) : efdReportApi[name](clean(params))), [JSON.stringify(params), err]);
  const [busy, setBusy] = useState(false); const [dlErr, setDlErr] = useState('');
  const download = async () => { setBusy(true); setDlErr(''); try { await efdReportApi.download(name, clean(params)); } catch (x) { setDlErr(errMsg(x)); } setBusy(false); };
  return { ...q, download, busy, dlErr };
}

// From / To dates with quick ranges, an optional device filter, and the CSV button (only for people with efd_reports.export). `children` adds more filters.
export function Toolbar({ f, setF, devices, rpt, period = true, device = true, children }) {
  const { t } = useTranslation('efdReports');
  const { t: tc } = useTranslation('common');
  const { t: te } = useTranslation('efd');
  const { can } = useAuth();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const range = (from, to) => setF({ ...f, from, to });
  const today = tzToday();
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
      {period && (<>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" aria-label={te('shared.fromDateAria')} className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || today} onChange={set('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" aria-label={te('shared.toDateAria')} className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
        <button type="button" className="btn-ghost" onClick={() => range(`${today.slice(0, 8)}01`, today)}>{t('toolbar.thisMonth')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(addDays(today, -29), today)}>{t('toolbar.last30')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(`${today.slice(0, 4)}-01-01`, today)}>{t('toolbar.thisYear')}</button>
      </>)}
      {device && devices?.length > 0 && (
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('toolbar.filterDeviceAria')} value={f.deviceId || ''} onChange={set('deviceId')}>
          <option value="">{t('toolbar.allDevices')}</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.serialNo})</option>)}
        </select>
      )}
      {children}
      {can('efd_reports.export') && <button type="button" className="btn-ghost ml-auto" disabled={rpt.busy || rpt.loading || !rpt.data} onClick={rpt.download}>{rpt.busy ? t('toolbar.preparing') : t('toolbar.download')}</button>}
    </div>
  );
}

export const Errors = ({ rpt, err }) => ((err || rpt.error || rpt.dlErr) ? <div className={`px-4 ${NOTICE}`}><Banner>{err || rpt.error || rpt.dlErr}</Banner></div> : null);

export const Empty = ({ cols, rpt, children }) => (!rpt.loading && rpt.data && rpt.data.rows.length === 0
  ? <tr><td className={`${CELL} text-left`} colSpan={cols}>{children}</td></tr> : null);

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { efdDeviceApi, efdDifferenceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { RefreshIcon } from '../../components/Icons.jsx';
import Pager from '../../components/Pager.jsx';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import useLoad from '../../utils/useLoad';
import { fmt, fmtNum } from '../../utils/format';
import { NOTICE, day, tzToday } from '../efdReconciliations/reconUi.jsx';
import { Facts, Gap, MAX_DAYS, Next, SEVERITIES, Sev, addDays, findingMessage, span, typeLabel, viewPath } from './diffUi.jsx';

const COLS = ['severity', 'type', 'date', 'device', 'found', 'expected', 'actual', 'difference', 'goTo'];
const CAP = 5000;     // the server stops at this many findings per rule

// Read-only scan of the fiscal records. Nothing is changed by it.
export default function EfdDifferencesList() {
  const { t } = useTranslation('efdDifferences');
  const { t: te } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ from: '', to: '', deviceId: '', type: '', severity: '' });     // blank dates = the server default (last 30 days)
  const canFilterDevice = can('efd_devices.read');
  const meta = useLoad(() => efdDifferenceApi.types().catch(() => null), []);
  const devs = useLoad(() => (canFilterDevice ? efdDeviceApi.list({ limit: 100 }) : Promise.resolve(null)), [canFilterDevice]);
  const rangeErr = f.from && f.to && f.from > f.to ? t('list.fromAfterTo')
    : f.from && f.to && span(f.from, f.to) > MAX_DAYS ? t('list.tooLong', { max: MAX_DAYS }) : '';
  const scan = useLoad(() => (rangeErr ? Promise.resolve(null) : efdDifferenceApi.scan({ page, limit: 25, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })), [page, f, rangeErr]);
  const d = scan.data;
  const rows = d?.data || []; const total = d?.total || 0; const limit = d?.limit || 25;
  const sum = d?.summary;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const pick = (k, v) => { setF({ ...f, [k]: f[k] === v ? '' : v }); setPage(1); };
  const range = (days) => { const to = tzToday(); setF({ ...f, from: addDays(to, -(days - 1)), to }); setPage(1); };
  const filtered = f.deviceId || f.type || f.severity;
  const cards = [['', t('cards.ALL'), sum?.total]].concat(SEVERITIES.map((s) => [s, t(`cards.${s}`), sum?.bySeverity?.[s]]));
  const typeOptions = (meta.data?.types || []).map((x) => ({ code: x.code, label: t(`types.${x.code}`, { defaultValue: x.label }) }));
  const typeName = Object.fromEntries(typeOptions.map((x) => [x.code, x.label]));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        <button type="button" className="btn-ghost gap-2" onClick={scan.reload} disabled={scan.loading}><RefreshIcon />{scan.loading ? t('list.scanning') : t('list.scanAgain')}</button>
      </div>

      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
        {cards.map(([k, label, n]) => (
          <button key={k || 'all'} type="button" onClick={() => (k ? pick('severity', k) : setF({ ...f, severity: '' }))}
            className={`rounded-md border p-4 text-left transition hover:bg-slate-50 ${(f.severity || '') === k ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}>
            <div className="text-xs uppercase">{label}</div>
            <div className={`mt-1 text-xl font-semibold ${k === 'HIGH' && n > 0 ? 'text-red-600' : ''}`}>{n ?? '—'}</div>
          </button>
        ))}
      </div>
      {sum && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {Object.entries(sum.byType).map(([code, n]) => (
            <button key={code} type="button" onClick={() => pick('type', code)} title={t('list.chipTitle')}
              className={`rounded-full border px-3 py-1 text-xs transition hover:bg-slate-50 ${f.type === code ? 'border-brand bg-emerald-50' : 'border-line'} ${n === 0 ? 'text-slate-500' : 'text-black'}`}>
              {typeName[code] || t(`types.${code}`, { defaultValue: code })}: <b>{n}</b>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" aria-label={te('shared.fromDateAria')} className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || tzToday()} onChange={set('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" aria-label={te('shared.toDateAria')} className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} max={tzToday()} onChange={set('to')} /></label>
        <button type="button" className="btn-ghost" onClick={() => range(7)}>{t('list.lastDays', { n: 7 })}</button>
        <button type="button" className="btn-ghost" onClick={() => range(30)}>{t('list.lastDays', { n: 30 })}</button>
        <button type="button" className="btn-ghost" onClick={() => range(MAX_DAYS)}>{t('list.lastDays', { n: MAX_DAYS })}</button>
        {canFilterDevice && (
          <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterDeviceAria')} value={f.deviceId} onChange={set('deviceId')}>
            <option value="">{t('list.allDevices')}</option>{(devs.data?.data || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.serialNo})</option>)}
          </select>
        )}
        <select className="input max-w-[18rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterTypeAria')} value={f.type} onChange={set('type')}>
          <option value="">{t('list.allTypes')}</option>{typeOptions.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
        </select>
        {filtered && <button type="button" className="btn-ghost" onClick={() => { setF({ ...f, deviceId: '', type: '', severity: '' }); setPage(1); }}>{t('list.clearFilters')}</button>}
      </div>

      <div className={`px-4 ${NOTICE}`}>
        <Banner>{rangeErr || scan.error}</Banner>
        {d?.capped && <Banner>{t('list.capped', { cap: fmtNum(CAP) })}</Banner>}
        {f.deviceId && (!f.type || f.type === 'UNRECEIPTED_ORDER') && <Banner kind="ok">{t('list.deviceNote', { type: t('types.UNRECEIPTED_ORDER') })}</Banner>}
      </div>
      {d && <p className="px-4 pb-3 text-[14px]">{t('list.scanned', { from: day(d.from), to: day(d.to), tz: d.timezone, at: fmt(d.generatedAt) })}</p>}

      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {scan.loading && !d && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{t('list.scanningRecords')}</td></tr>}
            {!scan.loading && d && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{sum?.total === 0 ? t('list.emptyClean') : t('list.emptyFiltered')}</td></tr>}
            {rows.map((x) => (
              <tr key={x.key} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}><Sev s={x.severity} /></td>
                <td className={`${CELL} text-center`}><Link to={viewPath(x)} className="text-black underline">{typeLabel(x, t)}</Link></td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(x.date)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{x.deviceSerial || '—'}</td>
                <td className={`${CELL} text-center`}>{findingMessage(x, t)}{x.ageDays != null && <div className="text-xs">{t('list.ageDays', { days: x.ageDays })}</div>}</td>
                <td className={`${CELL} text-center`}><Facts v={x.expected} /></td>
                <td className={`${CELL} text-center`}><Facts v={x.actual} /></td>
                <td className={`${CELL} text-center`}><Gap v={x.difference} /></td>
                <td className={`${CELL} text-center`}><Next x={x} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3"><Pager page={page} total={total} limit={limit} set={setPage} /></div>
    </div>
  );
}

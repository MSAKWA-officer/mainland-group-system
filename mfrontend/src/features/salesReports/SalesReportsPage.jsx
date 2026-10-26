import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { salesReportApi, salespersonApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';
import { NOTICE, day, money, tzToday } from '../efdReconciliations/reconUi.jsx';

const TABS = ['detail', 'summary', 'salespersons', 'customers', 'products'];
const MAX_DAYS = 366;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const span = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
const num = (v, max = 0) => Number(v || 0).toLocaleString(currentLocale(), { maximumFractionDigits: max });
const BODY = 'border border-black bg-white px-2 py-1.5 text-left';
const shade = (c) => (c.key === 'total' || c.key === 'value' ? '!bg-[#EAF2F8]' : '');
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

// Sales reports: cash + credit sales that are COMPLETED, calculated live. Company-wide (Owner / Manager); Excel / CSV need sales_reports.export.
// Period: one day, one month, one year or a date range. Every tab downloads as Excel in the company layout.
export default function SalesReportsPage() {
  const { t } = useTranslation('salesReports');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const today = tzToday();
  const [tab, setTab] = useState('detail');
  const [f, setF] = useState({ from: `${today.slice(0, 8)}01`, to: monthEnd(today.slice(0, 7)), saleType: '', salespersonId: '', groupBy: 'day' });
  const [busy, setBusy] = useState(false); const [dlErr, setDlErr] = useState('');
  const sps = useLoad(() => (can('salespersons.read') ? salespersonApi.list({ limit: 100 }) : Promise.resolve(null)), []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const range = (from, to) => setF({ ...f, from, to });
  const years = Array.from({ length: 6 }, (_, i) => String(Number(today.slice(0, 4)) - i));
  const isMonth = f.from.slice(8) === '01' && f.to === monthEnd(f.from.slice(0, 7)) && f.from.slice(0, 7) === f.to.slice(0, 7);
  const isYear = f.from.slice(5) === '01-01' && f.to === `${f.from.slice(0, 4)}-12-31`;

  const err = !f.from || !f.to ? t('errors.chooseBoth') : f.from > f.to ? t('errors.fromAfterTo') : span(f.from, f.to) > MAX_DAYS ? t('errors.maxDays', { max: MAX_DAYS }) : '';
  const params = clean({ ...f, ...(tab !== 'summary' && { groupBy: '' }) });
  const rpt = useLoad(() => (err ? Promise.resolve(null) : salesReportApi[tab](params)), [tab, JSON.stringify(params), err]);
  const download = async (format) => { setBusy(true); setDlErr(''); try { await salesReportApi.download(tab, params, format); } catch (x) { setDlErr(errMsg(x)); } setBusy(false); };

  const d = rpt.data; const columns = d?.columns || []; const rows = d?.rows || [];
  const head = (c) => (c.key === 'period' ? t(`cols.period_${f.groupBy}`) : t(`cols.${c.key}`, { defaultValue: c.label }));
  const cell = (c, v) => (c.type === 'money' ? money(v) : c.type === 'count' ? num(v) : c.type === 'qty' ? num(v, 3) : c.key === 'date' || c.key === 'lastSale' || (c.key === 'period' && f.groupBy === 'day') ? (v ? day(v) : '—') : (v || '—'));
  const align = (c) => (c.type === 'text' ? 'text-left' : 'text-right');

  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4" role="tablist" aria-label={t('title')}>
        {TABS.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(k)}>{t(`tabs.${k}`)}</button>)}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <label className="flex items-center gap-2">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={set('from')} /></label>
        <label className="flex items-center gap-2">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
        <button type="button" className="btn-ghost" onClick={() => range(today, today)}>{t('toolbar.today')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(`${today.slice(0, 8)}01`, today)}>{t('toolbar.thisMonth')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(addDays(today, -29), today)}>{t('toolbar.last30')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(`${today.slice(0, 4)}-01-01`, today)}>{t('toolbar.thisYear')}</button>
        <input type="month" className="input w-auto !text-[14px] !text-[#212121]" aria-label={t('toolbar.mMonth')} title={t('toolbar.mMonth')} value={isMonth ? f.from.slice(0, 7) : ''} onChange={(e) => e.target.value && range(`${e.target.value}-01`, monthEnd(e.target.value))} />
        <select className="input max-w-[8rem] !text-[14px] !text-[#212121]" aria-label={t('toolbar.mYear')} value={isYear ? f.from.slice(0, 4) : ''} onChange={(e) => e.target.value && range(`${e.target.value}-01-01`, `${e.target.value}-12-31`)}>
          <option value="">{t('toolbar.mYear')}</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('toolbar.type')} value={f.saleType} onChange={set('saleType')}>
          <option value="">{t('toolbar.allTypes')}</option><option value="CASH">{t('toolbar.cash')}</option><option value="CREDIT">{t('toolbar.credit')}</option>
        </select>
        {sps.data?.data?.length > 0 && (
          <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('toolbar.salesperson')} value={f.salespersonId} onChange={set('salespersonId')}>
            <option value="">{t('toolbar.allSalespersons')}</option>{sps.data.data.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        )}
        {tab === 'summary' && (
          <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('toolbar.groupBy')} value={f.groupBy} onChange={set('groupBy')}>
            <option value="day">{t('toolbar.byDay')}</option><option value="month">{t('toolbar.byMonth')}</option><option value="year">{t('toolbar.byYear')}</option>
          </select>
        )}
        {can('sales_reports.export') && (
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn-primary" disabled={busy || rpt.loading || !d} onClick={() => download('xlsx')}>{busy ? t('toolbar.preparing') : t('toolbar.download')}</button>
            <button type="button" className="btn-primary" disabled={busy || rpt.loading || !d} onClick={() => download('pdf')}>{t('toolbar.downloadPdf')}</button>
            <button type="button" className="btn-ghost" disabled={busy || rpt.loading || !d} onClick={() => download('csv')}>{t('toolbar.downloadCsv')}</button>
          </span>
        )}
      </div>
      {tab === 'detail' && <p className="px-4 pb-3 text-[13px] text-slate-600">{t('detailNote')}</p>}
      {(err || rpt.error || dlErr) && <div className={`px-4 ${NOTICE}`}><Banner>{err || rpt.error || dlErr}</Banner></div>}

      <div className="overflow-x-auto px-4 pb-4">
        {/* Same look as the company Excel / PDF template: navy title bar, blue header, black borders, Total column shaded. */}
        <div className="bg-[#17365D] py-2 text-center text-[16px] font-bold text-white">{d?.reportTitle || t('title')}</div>
        <table className="w-full border-collapse bg-white">
          <thead><tr>{columns.map((c) => <th key={c.key} className="whitespace-nowrap border border-black bg-[#1F4E78] px-2 py-2.5 text-center text-[14px] font-bold text-white">{head(c)}</th>)}</tr></thead>
          <tbody>
            {rpt.loading && !d && <tr><td className={BODY} colSpan={9}>{tc('loading')}</td></tr>}
            {!rpt.loading && d && rows.length === 0 && <tr><td className={BODY} colSpan={columns.length}>{t('empty')}</td></tr>}
            {rows.map((r, i) => <tr key={r.itemId || r.customerId || r.salespersonId || r.period || i} className="bg-white">{columns.map((c) => <td key={c.key} className={`${BODY} whitespace-nowrap ${align(c)} ${shade(c)}`}>{cell(c, r[c.key])}</td>)}</tr>)}
            {d && rows.length > 0 && (
              <tr className="font-bold">
                {columns.map((c, i) => <td key={c.key} className={`${BODY} whitespace-nowrap ${align(c)} ${shade(c)}`}>{i === 0 ? t('total') : (d.totals[c.key] !== undefined ? cell(c, d.totals[c.key]) : '')}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { paymentReportApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, tzToday } from '../efdReconciliations/reconUi.jsx';
import { ReportTable, addDays, clean, span } from '../reportsCommon/reportTable.jsx';

const TABS = ['detail', 'summary', 'methods', 'customers', 'accounts', 'paidOut'];
const MAX_DAYS = 366;
const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE'];
const INPUT = 'input w-auto !text-[14px] !text-[#212121]';

// Payments reports: money received from customers (completed cash + credit sales, voided payments ignored) and money paid out, calculated live.
// Company-wide (Owner / Manager). Excel / PDF / CSV need payment_reports.export.
export default function PaymentReportsPage() {
  const { t } = useTranslation('paymentReports');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const today = tzToday();
  const tabs = TABS.filter((k) => k !== 'paidOut' || can('payments.read'));
  const [tab, setTab] = useState('detail');
  const [f, setF] = useState({ from: `${today.slice(0, 8)}01`, to: today, method: '', saleType: '', groupBy: 'day' });
  const [busy, setBusy] = useState(false); const [dlErr, setDlErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const range = (from, to) => setF({ ...f, from, to });

  const err = !f.from || !f.to ? t('errors.chooseBoth') : f.from > f.to ? t('errors.fromAfterTo') : span(f.from, f.to) > MAX_DAYS ? t('errors.maxDays', { max: MAX_DAYS }) : '';
  const params = clean({ from: f.from, to: f.to, method: f.method, ...(tab !== 'paidOut' && { saleType: f.saleType }), ...(tab === 'summary' && { groupBy: f.groupBy }) });
  const rpt = useLoad(() => (err ? Promise.resolve(null) : paymentReportApi[tab](params)), [tab, JSON.stringify(params), err]);
  const download = async (format) => { setBusy(true); setDlErr(''); try { await paymentReportApi.download(tab, params, format); } catch (x) { setDlErr(errMsg(x)); } setBusy(false); };
  const d = rpt.data;
  const head = (c) => (c.key === 'period' ? t(`cols.period_${f.groupBy}`) : t(`cols.${c.key}`, { defaultValue: c.label }));

  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4" role="tablist" aria-label={t('title')}>
        {tabs.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(k)}>{t(`tabs.${k}`)}</button>)}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <label className="flex items-center gap-2">{tc('from')} <input type="date" className={INPUT} value={f.from} max={f.to || undefined} onChange={set('from')} /></label>
        <label className="flex items-center gap-2">{tc('to')} <input type="date" className={INPUT} value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
        <button type="button" className="btn-ghost" onClick={() => range(today, today)}>{t('toolbar.today')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(`${today.slice(0, 8)}01`, today)}>{t('toolbar.thisMonth')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(addDays(today, -29), today)}>{t('toolbar.last30')}</button>
        <button type="button" className="btn-ghost" onClick={() => range(`${today.slice(0, 4)}-01-01`, today)}>{t('toolbar.thisYear')}</button>
        <select className={`${INPUT} max-w-[12rem]`} aria-label={t('toolbar.method')} value={f.method} onChange={set('method')}>
          <option value="">{t('toolbar.allMethods')}</option>{METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}
        </select>
        {tab !== 'paidOut' && (
          <select className={`${INPUT} max-w-[12rem]`} aria-label={t('toolbar.type')} value={f.saleType} onChange={set('saleType')}>
            <option value="">{t('toolbar.allTypes')}</option><option value="CASH">{t('toolbar.cashSales')}</option><option value="CREDIT">{t('toolbar.creditSales')}</option>
          </select>
        )}
        {tab === 'summary' && (
          <select className={`${INPUT} max-w-[10rem]`} aria-label={t('toolbar.groupBy')} value={f.groupBy} onChange={set('groupBy')}>
            <option value="day">{t('toolbar.byDay')}</option><option value="month">{t('toolbar.byMonth')}</option><option value="year">{t('toolbar.byYear')}</option>
          </select>
        )}
        {can('payment_reports.export') && (
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn-primary" disabled={busy || rpt.loading || !d} onClick={() => download('xlsx')}>{busy ? t('toolbar.preparing') : t('toolbar.download')}</button>
            <button type="button" className="btn-primary" disabled={busy || rpt.loading || !d} onClick={() => download('pdf')}>{t('toolbar.downloadPdf')}</button>
            <button type="button" className="btn-ghost" disabled={busy || rpt.loading || !d} onClick={() => download('csv')}>{t('toolbar.downloadCsv')}</button>
          </span>
        )}
      </div>
      {(err || rpt.error || dlErr) && <div className={`px-4 ${NOTICE}`}><Banner>{err || rpt.error || dlErr}</Banner></div>}

      <ReportTable data={d} loading={rpt.loading} head={head} empty={tab === 'paidOut' ? t('emptyPaidOut') : t('empty')} totalLabel={t('total')} loadingLabel={tc('loading')} />
    </div>
  );
}

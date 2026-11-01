import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { customerBalanceReportApi, customerApi, salespersonApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Picker from '../../components/Picker.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, money, tzToday } from '../efdReconciliations/reconUi.jsx';
import { ReportTable, clean, span } from '../reportsCommon/reportTable.jsx';

const TABS = ['balances', 'ageing', 'invoices', 'statement'];
const MAX_DAYS = 1100;
const INPUT = 'input w-auto !text-[14px] !text-[#212121]';
const loadCustomers = async (s) => ((await customerApi.list({ search: s || undefined, limit: 20 })).data || []).map((c) => ({ id: c.id, label: `${c.code} - ${c.name}` }));

// Customer balance reports (credit sales): balances, ageing, unpaid invoices - all "as at" a date - and a statement of account for one customer.
// Company-wide (Owner / Manager). Excel / PDF / CSV need customer_balance_reports.export.
export default function CustomerBalanceReportsPage() {
  const { t } = useTranslation('customerBalanceReports');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const today = tzToday();
  const [tab, setTab] = useState('balances');
  const [f, setF] = useState({ asOf: today, salespersonId: '', includeZero: false, overdueOnly: false, from: `${today.slice(0, 4)}-01-01`, to: today });
  const [customer, setCustomer] = useState(null);
  const [busy, setBusy] = useState(false); const [dlErr, setDlErr] = useState('');
  const sps = useLoad(() => (can('salespersons.read') ? salespersonApi.list({ limit: 100 }) : Promise.resolve(null)), []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const tick = (k) => (e) => setF({ ...f, [k]: e.target.checked });
  const isStatement = tab === 'statement';

  const err = isStatement
    ? (!customer ? t('errors.chooseCustomer') : !f.from || !f.to ? t('errors.chooseBoth') : f.from > f.to ? t('errors.fromAfterTo') : span(f.from, f.to) > MAX_DAYS ? t('errors.maxDays', { max: MAX_DAYS }) : '')
    : '';
  const params = isStatement
    ? clean({ customerId: customer?.id, from: f.from, to: f.to })
    : clean({ asOf: f.asOf, salespersonId: f.salespersonId, ...(tab === 'balances' && { includeZero: f.includeZero, overdueOnly: f.overdueOnly }) });
  const rpt = useLoad(() => (err ? Promise.resolve(null) : customerBalanceReportApi[tab](params)), [tab, JSON.stringify(params), err]);
  const download = async (format) => { setBusy(true); setDlErr(''); try { await customerBalanceReportApi.download(tab, params, format); } catch (x) { setDlErr(errMsg(x)); } setBusy(false); };
  const d = err ? null : rpt.data;
  const head = (c) => t(`cols.${c.key}`, { defaultValue: c.label });

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
        {isStatement ? (
          <>
            <div className="w-72"><Picker value={customer?.id} selected={customer} load={loadCustomers} onPick={setCustomer} placeholder={t('toolbar.customer')} /></div>
            <label className="flex items-center gap-2">{tc('from')} <input type="date" className={INPUT} value={f.from} max={f.to || undefined} onChange={set('from')} /></label>
            <label className="flex items-center gap-2">{tc('to')} <input type="date" className={INPUT} value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2">{t('toolbar.asOf')} <input type="date" className={INPUT} value={f.asOf} onChange={set('asOf')} /></label>
            <button type="button" className="btn-ghost" onClick={() => setF({ ...f, asOf: today })}>{t('toolbar.today')}</button>
            {sps.data?.data?.length > 0 && (
              <select className={`${INPUT} max-w-[14rem]`} aria-label={t('toolbar.salesperson')} value={f.salespersonId} onChange={set('salespersonId')}>
                <option value="">{t('toolbar.allSalespersons')}</option>{sps.data.data.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            )}
            {tab === 'balances' && (
              <>
                <label className="flex items-center gap-2"><input type="checkbox" checked={f.overdueOnly} onChange={tick('overdueOnly')} /> {t('toolbar.overdueOnly')}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={f.includeZero} onChange={tick('includeZero')} /> {t('toolbar.includeZero')}</label>
              </>
            )}
          </>
        )}
        {can('customer_balance_reports.export') && (
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn-primary" disabled={busy || rpt.loading || !d} onClick={() => download('xlsx')}>{busy ? t('toolbar.preparing') : t('toolbar.download')}</button>
            <button type="button" className="btn-primary" disabled={busy || rpt.loading || !d} onClick={() => download('pdf')}>{t('toolbar.downloadPdf')}</button>
            <button type="button" className="btn-ghost" disabled={busy || rpt.loading || !d} onClick={() => download('csv')}>{t('toolbar.downloadCsv')}</button>
          </span>
        )}
      </div>
      {(err || rpt.error || dlErr) && <div className={`px-4 ${NOTICE}`}><Banner>{err || rpt.error || dlErr}</Banner></div>}
      {isStatement && d && <p className="px-4 pb-3 text-[14px] font-bold">{d.customer.name} ({d.customer.code}) - {t('statement.opening')}: {money(d.openingBalance)} - {t('statement.closing')}: {money(d.closingBalance)}</p>}

      {!err && <ReportTable data={d} loading={rpt.loading} head={head} empty={t(`empty.${tab}`)} totalLabel={t('total')} loadingLabel={tc('loading')} />}
    </div>
  );
}

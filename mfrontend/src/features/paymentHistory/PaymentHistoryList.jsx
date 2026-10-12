import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { paymentHistoryApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { EyeIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { METHOD, NOTICE, SaleType, day, money } from '../sales/saleUi.jsx';
import { Stat } from '../customerReports/reportUi.jsx';

// Every receipt taken against cash and credit sales. Users without payment_history.read_all only see receipts of their own sales.
// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['receipt', 'date', 'customer', 'sale', 'method', 'amount', 'receivedBy', 'status', 'actions'];

// Pager with translated labels (the shared PagerBar has English text built in).
const Pager = ({ page, total, limit, set }) => {
  const { t: tc } = useTranslation('common');
  return (
    <div className="flex items-center justify-between px-6 py-3 text-sm text-black">
      <span>{tc('records', { total })}</span>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => set(page - 1)}>{tc('previous')}</button>
        <button className="btn-ghost" disabled={page * limit >= total} onClick={() => set(page + 1)}>{tc('next')}</button>
      </div>
    </div>
  );
};

export default function PaymentHistoryList() {
  const { t } = useTranslation('paymentHistory');
  const { t: tc } = useTranslation('common');
  const [params, setParams] = useSearchParams();
  const customerId = params.get('customerId') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE'); const [saleType, setSaleType] = useState(''); const [method, setMethod] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => paymentHistoryApi.list({ page, limit: 25, status, ...(q && { search: q }), ...(saleType && { saleType }), ...(method && { method }),
    ...(customerId && { customerId }), ...(from && { from }), ...(to && { to }) }), [page, q, status, saleType, method, customerId, from, to]);
  const rows = list.data?.data || []; const sum = list.data?.summary;
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  const filtered = q || saleType || method || customerId || from || to || status !== 'ACTIVE';
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      {sum && (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('summary.totalReceived')} value={money(sum.totalReceived)} />
          <Stat label={t('summary.receipts')} value={sum.paymentCount} />
          <Stat label={t('summary.voidedAmount')} value={money(sum.totalVoided)} tone={Number(sum.totalVoided) > 0 ? 'text-red-600' : ''} />
          <Stat label={t('summary.voidedReceipts')} value={sum.voidedCount} />
        </div>
      )}
      {sum?.byMethod?.length > 0 && (
        <p className="px-4 pb-4 text-[14px]">{t('byMethod')} {sum.byMethod.map((m) => `${METHOD[m.method] || m.method} ${money(m.total)} (${m.count})`).join(' · ')}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('statusAria')} value={status} onChange={reset(setStatus)}>
          <option value="ACTIVE">{t('status.ACTIVE')}</option><option value="VOIDED">{t('status.VOIDED')}</option><option value="ALL">{t('status.ALL')}</option>
        </select>
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('saleTypeAria')} value={saleType} onChange={reset(setSaleType)}>
          <option value="">{t('saleType.ALL')}</option><option value="CASH">{t('saleType.CASH')}</option><option value="CREDIT">{t('saleType.CREDIT')}</option>
        </select>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('methodAria')} value={method} onChange={reset(setMethod)}>
          <option value="">{t('allMethods')}</option>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={from} max={to || undefined} onChange={reset(setFrom)} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={to} min={from || undefined} onChange={reset(setTo)} /></label>
        {customerId && <button type="button" className="btn-ghost" onClick={() => { setParams({}); setPage(1); }}>{t('clearCustomer')}</button>}
      </div>
      {list.error && <div className={`px-4 ${NOTICE}`}><Banner>{list.error}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.receiptNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.paidOn)}</td>
                <td className={`${CELL} text-center`}>{r.customerName || '—'}{r.customerCode && <div className="text-xs">{r.customerCode}</div>}</td>
                <td className={`${CELL} text-center`}>{r.saleNo}<div className="text-xs"><SaleType type={r.saleType} /></div></td>
                <td className={`${CELL} text-center`}>{METHOD[r.method] || r.method}{r.reference && <div className="text-xs">{r.reference}</div>}</td>
                <td className={`${CELL} whitespace-nowrap text-center ${r.isVoided ? '!text-slate-500 line-through' : ''}`}>{money(r.amount)}</td>
                <td className={`${CELL} text-center`}>{r.receivedBy}</td>
                <td className={`${CELL} text-center`}>{r.isVoided ? <span className="font-semibold text-red-600">{t('status.VOIDED')}</span> : t('status.ACTIVE')}</td>
                <td className={`${CELL} text-center`}>
                  <Link to={`/payment-history/${r.id}`} title={t('viewTitle')} aria-label={t('viewAria', { no: r.receiptNo })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><EyeIcon /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

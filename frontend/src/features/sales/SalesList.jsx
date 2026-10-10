import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { saleApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PAY, PayStatus, STATUS, SaleType, Status, customerName, day, money } from './saleUi.jsx';

const Card = ({ label, value, sub }) => (
  <div className="rounded-md border border-line px-4 py-3 text-black">
    <div className="text-xs uppercase">{label}</div>
    <div className="mt-1 text-xl font-semibold">{value}</div>
    {sub && <div className="text-xs">{sub}</div>}
  </div>
);

// SALES register: every cash and credit sale in one read-only list. New sales are made in Cash sales / Credit sales.
// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['saleNo', 'date', 'type', 'customer', 'salesperson', 'total', 'balance', 'payment', 'status', 'actions'];

export default function SalesList() {
  const { t } = useTranslation('sales');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [saleType, setSaleType] = useState(''); const [status, setStatus] = useState(''); const [paymentStatus, setPaymentStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const list = useLoad(() => saleApi.list({ page, limit: 25, ...(q && { search: q }), ...(saleType && { saleType }), ...(status && { status }),
    ...(paymentStatus && { paymentStatus }), ...(overdue && { overdue: 'true' }), ...(from && { from }), ...(to && { to }) }), [page, q, saleType, status, paymentStatus, overdue, from, to]);
  const showSummary = can('sales.summary');
  const sum = useLoad(() => (showSummary ? saleApi.summary({ ...(from && { from }), ...(to && { to }) }) : Promise.resolve(null)), [showSummary, from, to]);

  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  const s = sum.data; const cash = s?.byType?.CASH; const credit = s?.byType?.CREDIT;
  const filtered = q || saleType || status || paymentStatus || overdue || from || to;
  const doneCount = (cash?.count || 0) + (credit?.count || 0);
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { total })}</p>
        </div>
        <div className="flex gap-2">
          {can('cash_sales.create') && <Link to="/cash-sales" className="btn-ghost">{t('cashSales')}</Link>}
          {can('credit_sales.read') && <Link to="/credit-sales" className="btn-ghost">{t('creditSales')}</Link>}
        </div>
      </div>

      {showSummary && s && (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label={t('summary.totalSales')} value={money(s.grandTotal)} sub={s.voidedCount ? t('summary.completedVoided', { count: doneCount, voided: s.voidedCount }) : t('summary.completed', { count: doneCount })} />
          <Card label={t('summary.cashSales')} value={money(cash?.total)} sub={t('summary.salesCount', { count: cash?.count || 0 })} />
          <Card label={t('summary.creditSales')} value={money(credit?.total)} sub={t('summary.salesCount', { count: credit?.count || 0 })} />
          <Card label={t('summary.creditOutstanding')} value={money(s.totalOutstanding)} sub={t('summary.collected', { amount: money(s.totalPaid) })} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('filterTypeAria')} value={saleType} onChange={reset(setSaleType)}>
          <option value="">{t('allTypes')}</option><option value="CASH">{t('type.CASH')}</option><option value="CREDIT">{t('type.CREDIT')}</option>
        </select>
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatusAria')} value={status} onChange={reset(setStatus)}>
          <option value="">{t('allStatuses')}</option>{Object.keys(STATUS).map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}
        </select>
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('filterPaymentAria')} value={paymentStatus} onChange={reset(setPaymentStatus)}>
          <option value="">{t('allPayments')}</option>{Object.keys(PAY).map((k) => <option key={k} value={k}>{t(`pay.${k}`)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(1); }} />{t('overdueOnly')}</label>
        <label className="flex items-center gap-2 text-[14px]">{t('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={from} max={to || undefined} onChange={reset(setFrom)} /></label>
        <label className="flex items-center gap-2 text-[14px]">{t('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={to} min={from || undefined} onChange={reset(setTo)} /></label>
      </div>

      {(list.error || sum.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{list.error || sum.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.saleNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.saleDate)}</td>
                <td className={`${CELL} text-center`}><SaleType type={r.saleType} /></td>
                <td className={`${CELL} text-center`}>{customerName(r)}<div className="text-xs">{r.customer?.code}</div></td>
                <td className={`${CELL} text-center`}>{r.salesperson?.fullName || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.total)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.balance) > 0 ? money(r.balance) : '—'}
                  {r.isOverdue && <div className="text-xs font-semibold text-red-600">{t('overdue', { date: day(r.dueDate) })}</div>}</td>
                <td className={`${CELL} text-center`}>{r.status === 'COMPLETED' ? <PayStatus status={r.paymentStatus} /> : '—'}</td>
                <td className={`${CELL} text-center`}><Status status={r.status} /></td>
                <td className={`${CELL} text-center`}>
                  <button type="button" title={tc('view')} aria-label={tc('view')} onClick={() => navigate(`/sales/${r.id}`)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"><EyeIcon /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-[14px]">
        <span>{tc('records', { total })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cashSaleApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, EyeIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { splitReference } from '../sales/paymentProviders.js';
import { METHOD, NOTICE, Status, customerName, day, money } from '../sales/saleUi.jsx';

const IconBtn = ({ label, onClick, tone, children }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${tone}`}>{children}</button>
);

// Icon-only actions, used by this list and by CashSalesView. The API enforces the same rules.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('cashSales');
  const { can } = useAuth();
  const navigate = useNavigate();
  const doVoid = async () => {
    const reason = window.prompt(t('actions.voidPrompt', { no: r.saleNo }));
    if (!reason || reason.trim().length < 3) return;
    onError('');
    try { await cashSaleApi.voidSale(r.id, reason.trim()); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone="border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => navigate(`/cash-sales/${r.id}`)}><EyeIcon /></IconBtn>}
      {r.status === 'COMPLETED' && can('cash_sales.void') && <IconBtn label={t('actions.void')} tone="border-red-200 text-red-600 hover:bg-red-50" onClick={doVoid}><BanIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['saleNo', 'date', 'customer', 'salesperson', 'items', 'total', 'payment', 'status', 'actions'];
// Njia ya malipo + benki/mtandao (mfano "Benki · CRDB"). payMethod/payReference zinatoka backend (saleQueries.js).
const payText = (r) => {
  if (!r.payMethod) return '—';
  const { provider } = splitReference(r.payMethod, r.payReference);
  return provider ? `${METHOD[r.payMethod] || r.payMethod} · ${provider}` : (METHOD[r.payMethod] || r.payMethod);
};

export default function CashSalesList() {
  const { t } = useTranslation('cashSales');
  const { t: ts } = useTranslation('sales');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [status, setStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const x = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(x); }, [search]);
  const list = useLoad(() => cashSaleApi.list({ page, limit: 25, ...(q && { search: q }), ...(status && { status }), ...(from && { from }), ...(to && { to }) }), [page, q, status, from, to]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('count', { total })}</p>
        </div>
        {can('cash_sales.create') && <Link to="/cash-sales/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('new')}</Link>}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatusAria')} value={status} onChange={reset(setStatus)}>
          <option value="">{t('allStatuses')}</option><option value="COMPLETED">{ts('status.COMPLETED')}</option><option value="VOIDED">{ts('status.VOIDED')}</option>
        </select>
        <label className="flex items-center gap-2 text-[14px]">{t('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={from} max={to || undefined} onChange={reset(setFrom)} /></label>
        <label className="flex items-center gap-2 text-[14px]">{t('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={to} min={from || undefined} onChange={reset(setTo)} /></label>
      </div>
      {(err || list.error || location.state?.msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={9}>{q || status || from || to ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.saleNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.saleDate)}</td>
                <td className={`${CELL} text-center`}>{customerName(r)}<div className="text-xs">{r.customer?.code}</div></td>
                <td className={`${CELL} text-center`}>{r.salesperson?.fullName || '—'}</td>
                <td className={`${CELL} text-center`}>{r.lineCount}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.total)}</td>
                <td className={`${CELL} text-center`}>{payText(r)}</td>
                <td className={`${CELL} text-center`}><Status status={r.status} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={list.reload} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-[14px]">
        <span>{t('records', { total })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{t('next')}</button>
        </div>
      </div>
    </div>
  );
}

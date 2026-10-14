import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, salesOrderApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, PencilIcon, PlusIcon, SendIcon, TrashIcon, XCircleIcon } from '../../components/Icons.jsx';
import i18n from '../../i18n';
import { currentLocale } from '../../utils/locale';
import useLoad from '../../utils/useLoad';

// Banners keep their light background but their text is black.
export const NOTICE = '[&>div]:!text-black';

// STATUS keeps the old shape STATUS[code] = [label, dotColour]; the label is translated when it is read
// (maandishi yanatoka locales/<lugha>/salesOrders.json).
const entry = (key, dot) => ({
  get 0() { return i18n.t(`status.${key}`, { ns: 'salesOrders', defaultValue: key }); },
  1: dot,
  length: 2,
  *[Symbol.iterator]() { yield i18n.t(`status.${key}`, { ns: 'salesOrders', defaultValue: key }); yield dot; },
});
export const STATUS = Object.fromEntries(Object.entries({
  DRAFT: 'bg-slate-400', SUBMITTED: 'bg-amber-500', CONFIRMED: 'bg-emerald-600', REJECTED: 'bg-red-500', CANCELLED: 'bg-slate-400',
}).map(([k, dot]) => [k, entry(k, dot)]));
export const money = (v) => Number(v || 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(currentLocale(), { dateStyle: 'medium' }) : '—');

// Status as black text with a coloured dot (text itself stays black).
export const Status = ({ status }) => {
  useTranslation('salesOrders');                              // re-render when the language changes
  const [label, dot] = STATUS[status] || [status, 'bg-slate-400'];
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</span>;
};

// Cash / Credit badge (text stays black, only the dot is coloured).
export const SaleType = ({ type }) => {
  const { t } = useTranslation('salesOrders');
  if (!type) return '—';
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 rounded-full ${type === 'CASH' ? 'bg-emerald-600' : 'bg-indigo-500'}`} />{t(`saleType.${type}`)}</span>;
};
// Link to the sale that was created automatically when the order was approved.
export function SaleLink({ order }) {
  const { can } = useAuth();
  const s = order.sale;
  if (!s) return '—';
  const base = s.saleType === 'CASH' ? 'cash-sales' : 'credit-sales';
  return can(`${s.saleType === 'CASH' ? 'cash_sales' : 'credit_sales'}.read`)
    ? <Link to={`/${base}/${s.id}`} className="text-black underline">{s.saleNo}</Link> : s.saleNo;
}

const IconBtn = ({ label, onClick, tone, children }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${tone}`}>
    {children}
  </button>
);
const TONES = {
  view: 'border-blue-200 text-blue-600 hover:bg-blue-50', edit: 'border-amber-200 text-amber-600 hover:bg-amber-50',
  submit: 'border-indigo-200 text-indigo-600 hover:bg-indigo-50', approve: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50',
  reject: 'border-red-200 text-red-600 hover:bg-red-50', cancel: 'border-slate-300 text-slate-600 hover:bg-slate-100',
  del: 'border-red-200 text-red-600 hover:bg-red-50',
};

// Icon-only actions. Used by this list and by SalesOrdersView.
// Shown by status, ownership and permission (the API enforces the same rules).
export function RowActions({ r, showView, onChanged, onError, onNotice, afterDelete }) {
  const { t } = useTranslation('salesOrders');
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = r.createdBy === user.id;
  const approver = can('sales_orders.approve');
  const run = async (fn, done) => { onError(''); onNotice?.(''); try { await fn(); (done || onChanged)?.(); } catch (x) { onError(errMsg(x)); } };
  const p = { orderNo: r.orderNo };

  const submit = () => run(() => salesOrderApi.submit(r.id));
  const cancel = () => {
    let reason;
    if (r.status === 'CONFIRMED') {                                           // puts the stock back, so a reason is required
      reason = window.prompt(t('actions.cancelConfirmedPrompt', p));
      if (!reason || reason.trim().length < 3) return;
    } else if (!window.confirm(t('actions.cancelConfirm', p))) return;
    run(() => salesOrderApi.cancel(r.id, reason?.trim()));
  };
  const approve = () => {
    if (!window.confirm(t(`actions.approveConfirm${r.saleType === 'CREDIT' ? 'Credit' : 'Cash'}`, p))) return;
    run(async () => {
      const o = await salesOrderApi.approve(r.id);                           // the API creates the cash / credit sale in the same step
      onNotice?.(o.sale ? t('actions.approvedWithSale', { orderNo: o.orderNo, saleNo: o.sale.saleNo, type: t(`saleType.${o.sale.saleType}`) }) : t('actions.approved', p));
    });
  };
  const reject = () => { const note = window.prompt(t('actions.rejectPrompt', p)); if (note && note.trim()) run(() => salesOrderApi.reject(r.id, note.trim())); };
  const remove = () => { if (window.confirm(t('actions.deleteConfirm', p))) run(() => salesOrderApi.remove(r.id), afterDelete); };

  const items = [
    showView && ['view', TONES.view, () => navigate(`/sales-orders/${r.id}`), <EyeIcon />],
    mine && r.status === 'DRAFT' && can('sales_orders.create') && ['edit', TONES.edit, () => navigate(`/sales-orders/${r.id}/edit`), <PencilIcon />],
    mine && r.status === 'DRAFT' && can('sales_orders.create') && ['submit', TONES.submit, submit, <SendIcon />],
    ((mine && ['DRAFT', 'SUBMITTED'].includes(r.status)) || (r.status === 'CONFIRMED' && approver)) && ['cancel', TONES.cancel, cancel, <BanIcon />],
    !mine && r.status === 'SUBMITTED' && approver && ['approve', TONES.approve, approve, <CheckCircleIcon />],
    !mine && r.status === 'SUBMITTED' && approver && ['reject', TONES.reject, reject, <XCircleIcon />],
    (mine || user.role === 'OWNER') && ['DRAFT', 'CANCELLED', 'REJECTED'].includes(r.status) && !r.stockDocumentId && can('sales_orders.create')
      && ['delete', TONES.del, remove, <TrashIcon />],
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-2">
      {items.map(([key, tone, fn, icon]) => <IconBtn key={key} label={t(`actions.${key}`)} tone={tone} onClick={fn}>{icon}</IconBtn>)}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['orderNo', 'date', 'customer', 'saleType', 'salesperson', 'items', 'total', 'status', 'sale', 'actions'];

export default function SalesOrdersList() {
  const { t } = useTranslation('salesOrders');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [status, setStatus] = useState(''); const [saleType, setSaleType] = useState('');
  const [ok, setOk] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const list = useLoad(() => salesOrderApi.list({ page, limit: 25, ...(q && { search: q }), ...(saleType && { saleType }), ...(status && { status }), ...(from && { from }), ...(to && { to }) }), [page, q, saleType, status, from, to]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { total })}</p>
        </div>
        {can('sales_orders.create') && <Link to="/sales-orders/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('newButton')}</Link>}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('filterTypeAria')} value={saleType} onChange={reset(setSaleType)}>
          <option value="">{t('allTypes')}</option><option value="CASH">{t('saleType.CASH')}</option><option value="CREDIT">{t('saleType.CREDIT')}</option>
        </select>
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatusAria')} value={status} onChange={reset(setStatus)}>
          <option value="">{t('allStatuses')}</option>{Object.keys(STATUS).map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[14px]">{t('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={from} max={to || undefined} onChange={reset(setFrom)} /></label>
        <label className="flex items-center gap-2 text-[14px]">{t('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={to} min={from || undefined} onChange={reset(setTo)} /></label>
      </div>
      {(err || list.error || ok || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{ok || location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{q || status || saleType || from || to ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.orderNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.orderDate)}</td>
                <td className={`${CELL} text-center`}>{r.customer?.name}<div className="text-xs">{r.customer?.code}</div></td>
                <td className={`${CELL} whitespace-nowrap text-center`}><SaleType type={r.saleType} /></td>
                <td className={`${CELL} text-center`}>{r.salesperson?.fullName || '—'}</td>
                <td className={`${CELL} text-center`}>{r.lineCount}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.total)}</td>
                <td className={`${CELL} text-center`}><Status status={r.status} /></td>
                <td className={`${CELL} whitespace-nowrap text-center`}><SaleLink order={r} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={list.reload} onError={(m) => { setErr(m); if (m) setOk(''); }} onNotice={(m) => { setOk(m); setErr(''); }} /></div></td>
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

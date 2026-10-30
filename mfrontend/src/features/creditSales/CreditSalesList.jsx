import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { creditSaleApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, PencilIcon, PlusIcon, SendIcon, TrashIcon, XCircleIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PAY, PayStatus, STATUS, Status, day, money } from '../sales/saleUi.jsx';

const IconBtn = ({ label, onClick, tone, children }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${tone}`}>{children}</button>
);
const TONES = {
  view: 'border-blue-200 text-blue-600 hover:bg-blue-50', edit: 'border-amber-200 text-amber-600 hover:bg-amber-50',
  submit: 'border-indigo-200 text-indigo-600 hover:bg-indigo-50', approve: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50',
  reject: 'border-red-200 text-red-600 hover:bg-red-50', cancel: 'border-slate-300 text-slate-600 hover:bg-slate-100', del: 'border-red-200 text-red-600 hover:bg-red-50',
};

// Icon-only actions, used by this list and by CreditSalesView. Shown by status, ownership and permission (the API enforces the same rules).
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('creditSales');
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = r.createdBy === user.id;
  const run = async (fn, done) => { onError(''); try { await fn(); (done || onChanged)?.(); } catch (x) { onError(errMsg(x)); } };
  const ask = (text) => { const v = window.prompt(text); return v && v.trim().length >= 3 ? v.trim() : null; };
  const no = r.saleNo;

  const submit = () => run(() => creditSaleApi.submit(r.id));
  const cancel = () => { if (window.confirm(t('actions.cancelConfirm', { no }))) run(() => creditSaleApi.cancel(r.id)); };
  const approve = () => { if (window.confirm(t('actions.approveConfirm', { no, amount: money(r.total) }))) run(() => creditSaleApi.approve(r.id)); };
  const reject = () => { const note = window.prompt(t('actions.rejectPrompt', { no })); if (note && note.trim()) run(() => creditSaleApi.reject(r.id, note.trim())); };
  const doVoid = () => { const reason = ask(t('actions.voidPrompt', { no })); if (reason) run(() => creditSaleApi.voidSale(r.id, reason)); };
  const remove = () => { if (window.confirm(t('actions.deleteConfirm', { no }))) run(() => creditSaleApi.remove(r.id), afterDelete); };

  const items = [
    showView && ['view', TONES.view, () => navigate(`/credit-sales/${r.id}`), <EyeIcon />],
    mine && r.status === 'DRAFT' && can('credit_sales.create') && ['edit', TONES.edit, () => navigate(`/credit-sales/${r.id}/edit`), <PencilIcon />],
    mine && r.status === 'DRAFT' && can('credit_sales.create') && ['submit', TONES.submit, submit, <SendIcon />],
    mine && ['DRAFT', 'SUBMITTED'].includes(r.status) && can('credit_sales.create') && ['cancel', TONES.cancel, cancel, <BanIcon />],
    !mine && r.status === 'SUBMITTED' && can('credit_sales.approve') && ['approve', TONES.approve, approve, <CheckCircleIcon />],
    !mine && r.status === 'SUBMITTED' && can('credit_sales.approve') && ['reject', TONES.reject, reject, <XCircleIcon />],
    r.status === 'COMPLETED' && Number(r.amountPaid) === 0 && can('credit_sales.void') && ['void', TONES.reject, doVoid, <TrashIcon />],
    (mine || user.role === 'OWNER') && ['DRAFT', 'CANCELLED', 'REJECTED'].includes(r.status) && !r.stockDocumentId && can('credit_sales.create') && ['delete', TONES.del, remove, <TrashIcon />],
  ].filter(Boolean);
  return <div className="flex items-center gap-2">{items.map(([key, tone, fn, icon]) => <IconBtn key={key} label={t(`actions.${key}`)} tone={tone} onClick={fn}>{icon}</IconBtn>)}</div>;
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['saleNo', 'date', 'customer', 'salesperson', 'total', 'balance', 'due', 'status', 'actions'];

export default function CreditSalesList() {
  const { t } = useTranslation('creditSales');
  const { t: ts } = useTranslation('sales');
  const { can } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const customerId = params.get('customerId') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [status, setStatus] = useState(''); const [paymentStatus, setPaymentStatus] = useState(''); const [overdue, setOverdue] = useState(params.get('overdue') === 'true');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const x = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(x); }, [search]);
  const list = useLoad(() => creditSaleApi.list({ page, limit: 25, ...(q && { search: q }), ...(status && { status }), ...(paymentStatus && { paymentStatus }),
    ...(customerId && { customerId }), ...(overdue && { overdue: 'true' }), ...(from && { from }), ...(to && { to }) }), [page, q, status, paymentStatus, customerId, overdue, from, to]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  const filtered = q || status || paymentStatus || customerId || overdue || from || to;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('count', { total })}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/credit-sales/receivables" className="btn-ghost">{t('receivables')}</Link>
          {can('credit_sales.create') && <Link to="/credit-sales/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('new')}</Link>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatusAria')} value={status} onChange={reset(setStatus)}>
          <option value="">{t('allStatuses')}</option>{Object.keys(STATUS).map((k) => <option key={k} value={k}>{ts(`status.${k}`)}</option>)}
        </select>
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('filterPaymentAria')} value={paymentStatus} onChange={reset(setPaymentStatus)}>
          <option value="">{t('allPayments')}</option>{Object.keys(PAY).map((k) => <option key={k} value={k}>{ts(`pay.${k}`)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); setPage(1); }} />{t('overdueOnly')}</label>
        <label className="flex items-center gap-2 text-[14px]">{t('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={from} max={to || undefined} onChange={reset(setFrom)} /></label>
        <label className="flex items-center gap-2 text-[14px]">{t('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={to} min={from || undefined} onChange={reset(setTo)} /></label>
        {customerId && <button type="button" className="btn-ghost" onClick={() => { setParams({}); setPage(1); }}>{t('oneCustomer')}</button>}
      </div>
      {(err || list.error || location.state?.msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={9}>{filtered ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.saleNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.saleDate)}</td>
                <td className={`${CELL} text-center`}>{r.customer?.name}<div className="text-xs">{r.customer?.code}</div></td>
                <td className={`${CELL} text-center`}>{r.salesperson?.fullName || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.total)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.balance) > 0 ? money(r.balance) : '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.dueDate)}{r.isOverdue && <div className="text-xs font-semibold text-red-600">{t('overdue')}</div>}</td>
                <td className={`${CELL} text-center`}><Status status={r.status} />{r.status === 'COMPLETED' && <div className="mt-1 text-xs"><PayStatus status={r.paymentStatus} /></div>}</td>
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

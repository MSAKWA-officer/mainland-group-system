import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, expenseApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, PencilIcon, PlusIcon, XCircleIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { IconBtn, NOTICE, Stat, TONES, askReason, day, money } from '../banking/bankingUi.jsx';
import { CATEGORY_CODES } from './ExpensesForm.jsx';

export { NOTICE };

const MoneyIcon = (p) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>);

// Status as black text with a coloured dot, translated (the shared Dot has English labels built in).
// `pay` shows the payment state (UNPAID / PARTIAL / PAID) instead of the approval state. Labels: expenses.json -> status.* / payStatus.*
const DOTS = { PENDING: 'bg-amber-500', APPROVED: 'bg-emerald-600', REJECTED: 'bg-red-500', VOIDED: 'bg-red-500', UNPAID: 'bg-red-500', PARTIAL: 'bg-amber-500', PAID: 'bg-emerald-600' };
export const ExpenseStatus = ({ value, pay }) => {
  const { t } = useTranslation('expenses');
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[value] || 'bg-slate-400'}`} />{t(`${pay ? 'payStatus' : 'status'}.${value}`, { defaultValue: value })}</span>;
};

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

// Icon-only actions: View, Edit (own pending expense), Approve, Reject, Pay, Void. Used by this list and by ExpensesView.
// The server enforces every rule (for example nobody approves their own expense); the buttons only hide what you cannot do.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('expenses');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const pending = r.status === 'PENDING';
  const approved = r.status === 'APPROVED';
  const run = (fn, done) => async () => { onError(''); try { await fn(); onChanged?.(done); } catch (x) { onError(errMsg(x)); } };
  const approve = () => {
    if (!window.confirm(t('actions.approveConfirm', { no: r.expenseNo, amount: money(r.amount) }))) return Promise.resolve();
    return run(() => expenseApi.approve(r.id), t('actions.approved'))();
  };
  const reject = () => {
    const note = askReason(t('actions.rejectPrompt', { no: r.expenseNo }));
    return note ? run(() => expenseApi.reject(r.id, note), t('actions.rejected'))() : Promise.resolve();
  };
  const voidIt = () => {
    const reason = askReason(t('actions.voidPrompt', { no: r.expenseNo }));
    return reason ? run(() => expenseApi.voidExpense(r.id, reason), t('actions.voided'))() : Promise.resolve();
  };
  const canPay = approved && Number(r.outstandingAmount) > 0 && can('payments.create');
  const canVoid = (pending || approved) && Number(r.paidAmount || 0) === 0 && can('expenses.void');
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/expenses/${r.id}`)}><EyeIcon /></IconBtn>}
      {pending && can('expenses.update') && r.createdBy === user?.id && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/expenses/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {pending && can('expenses.approve') && <IconBtn label={t('actions.approve')} tone={TONES.on} onClick={approve}><CheckCircleIcon /></IconBtn>}
      {pending && can('expenses.approve') && <IconBtn label={t('actions.reject')} tone={TONES.del} onClick={reject}><XCircleIcon /></IconBtn>}
      {canPay && <IconBtn label={t('actions.pay')} tone={TONES.view} onClick={() => navigate(`/payments/new?expenseId=${r.id}`)}><MoneyIcon /></IconBtn>}
      {canVoid && <IconBtn label={t('actions.void')} tone={TONES.off} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['expenseNo', 'date', 'category', 'description', 'amount', 'paid', 'status', 'submittedBy', 'actions'];

export default function ExpensesList() {
  const { t } = useTranslation('expenses');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ category: '', status: 'ALL', paymentStatus: '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => expenseApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const sum = useLoad(() => expenseApi.summary({ ...(f.from && { from: f.from }), ...(f.to && { to: f.to }) }), [f.from, f.to]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); sum.reload(); };
  const filtered = q || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));
  const msg = ok || location.state?.msg;
  const cat = (c) => t(`category.${c}`, { defaultValue: c });
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        {can('expenses.create') && <Link to="/expenses/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('list.stats.approvedFilter')} value={money(list.data?.approvedTotal)} />
        <Stat label={t('list.stats.approvedPeriod')} value={money(sum.data?.total)} />
        <Stat label={t('list.stats.records')} value={total} />
      </div>
      {sum.data?.categories?.length > 0 && (
        <p className="px-4 pb-4 text-[14px]">{t('list.byCategory')} {sum.data.categories.map((c) => `${cat(c.category)} ${money(c.total)} (${c.count})`).join(' · ')}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterCategoryAria')} value={f.category} onChange={setFilter('category')}>
          <option value="">{t('list.allCategories')}</option>{CATEGORY_CODES.map((k) => <option key={k} value={k}>{cat(k)}</option>)}
        </select>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          <option value="ALL">{t('status.ALL')}</option><option value="PENDING">{t('status.PENDING')}</option><option value="APPROVED">{t('status.APPROVED')}</option><option value="REJECTED">{t('status.REJECTED')}</option><option value="VOIDED">{t('status.VOIDED')}</option>
        </select>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterPaymentAria')} value={f.paymentStatus} onChange={setFilter('paymentStatus')}>
          <option value="">{t('list.anyPayment')}</option><option value="UNPAID">{t('payStatus.UNPAID')}</option><option value="PARTIAL">{t('payStatus.PARTIAL')}</option><option value="PAID">{t('payStatus.PAID')}</option>
        </select>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.expenseNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.expenseDate)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{cat(r.category)}</td>
                <td className={`${CELL} text-center`}>{r.description}{r.payee && <div className="text-xs">{t('list.to', { payee: r.payee })}</div>}</td>
                <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{money(r.amount)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.status === 'APPROVED' ? <>{money(r.paidAmount)}<div className="text-xs"><ExpenseStatus pay value={r.paymentStatus} /></div></> : '—'}</td>
                <td className={`${CELL} text-center`}><ExpenseStatus value={r.status} /></td>
                <td className={`${CELL} text-center`}>{r.creator?.fullName}</td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, paymentApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, EyeIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { AccountSelect, IconBtn, METHOD, NOTICE, Stat, TONES, askReason, day, money, useAccounts } from '../banking/bankingUi.jsx';

export { NOTICE };

// Status as black text with a coloured dot, translated (the shared Dot has English labels built in).
// Labels come from locales/<lang>/payments.json (status.<CODE>). Also used by ExpensesView for the payments of an expense
// and by PaymentsView for its bank ledger lines (POSTED / VOIDED).
const DOTS = { ACTIVE: 'bg-emerald-600', POSTED: 'bg-emerald-600', VOIDED: 'bg-red-500' };
export const PaymentStatus = ({ value }) => {
  const { t } = useTranslation('payments');
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[value] || 'bg-slate-400'}`} />{t(`status.${value}`, { defaultValue: value })}</span>;
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

// Icon-only actions: View and Void. Voiding reverses the payment and its bank ledger entry together.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('payments');
  const { can } = useAuth();
  const navigate = useNavigate();
  const voidIt = async () => {
    const reason = askReason(t('actions.voidPrompt', { no: r.paymentNo, amount: money(r.amount), payee: r.payee }));
    if (!reason) return;
    onError('');
    try { await paymentApi.voidPayment(r.id, reason); onChanged?.(t('actions.voided')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/payments/${r.id}`)}><EyeIcon /></IconBtn>}
      {r.status === 'ACTIVE' && can('payments.void') && <IconBtn label={t('actions.void')} tone={TONES.del} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

// Money paid OUT: to suppliers, a landlord, staff… (money received from customers is under Customer payments).
// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['paymentNo', 'date', 'paidTo', 'expense', 'method', 'paidFrom', 'amount', 'status', 'actions'];

export default function PaymentsList() {
  const { t } = useTranslation('payments');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const expenseId = params.get('expenseId') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ status: 'ACTIVE', method: '', bankAccountId: '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const accounts = useAccounts();
  const list = useLoad(() => paymentApi.list({ page, limit: 25, ...(q && { search: q }), ...(expenseId && { expenseId }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }),
    [page, q, f, expenseId]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const filtered = q || expenseId || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ACTIVE'));
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        {can('payments.create') && <Link to="/payments/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('list.stats.paidOut')} value={money(list.data?.activeTotal)} />
        <Stat label={t('list.stats.records')} value={total} />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[9rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          <option value="ACTIVE">{t('status.ACTIVE')}</option><option value="VOIDED">{t('status.VOIDED')}</option><option value="ALL">{t('status.ALL')}</option>
        </select>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterMethodAria')} value={f.method} onChange={setFilter('method')}>
          <option value="">{t('list.allMethods')}</option>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {can('bank_accounts.read') && <div className="max-w-[16rem] flex-1"><AccountSelect accounts={accounts.data?.data} value={f.bankAccountId} onChange={setFilter('bankAccountId')} placeholder={t('list.allBankAccounts')} /></div>}
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
        {expenseId && <button type="button" className="btn-ghost" onClick={() => { setParams({}); setPage(1); }}>{t('list.clearExpense')}</button>}
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.paymentNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.paidOn)}</td>
                <td className={`${CELL} text-center`}>{r.payee}</td>
                <td className={`${CELL} text-center`}>{r.expense ? (can('expenses.read') ? <Link to={`/expenses/${r.expense.id}`} className="underline">{r.expense.expenseNo}</Link> : r.expense.expenseNo) : <span className="text-xs">{t('list.directPayment')}</span>}</td>
                <td className={`${CELL} text-center`}>{METHOD[r.method] || r.method}{r.reference && <div className="text-xs">{r.reference}</div>}</td>
                <td className={`${CELL} text-center`}>{r.bankAccount ? <>{r.bankAccount.accountName}<div className="text-xs">{r.bankAccount.bank?.name} · {r.bankAccount.accountNo}</div></> : <span className="text-xs">{t('list.notFromBank')}</span>}</td>
                <td className={`${CELL} whitespace-nowrap text-center ${r.status === 'VOIDED' ? '!text-slate-500 line-through' : ''} !font-semibold`}>{money(r.amount)}</td>
                <td className={`${CELL} text-center`}><PaymentStatus value={r.status} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={(m) => { setOk(m || ''); list.reload(); }} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

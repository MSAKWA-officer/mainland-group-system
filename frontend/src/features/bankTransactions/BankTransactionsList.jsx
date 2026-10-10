import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { bankTransactionApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, PlusIcon, XCircleIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { AccountSelect, IconBtn, NOTICE, TONES, askReason, day, money, useAccounts } from '../banking/bankingUi.jsx';

export { NOTICE };

// Transaction type codes; the labels come from locales/<lang>/bankTransactions.json (type.<CODE>).
export const TYPE_CODES = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'CHARGE', 'INTEREST', 'CUSTOMER_PAYMENT'];
const DOTS = { POSTED: 'bg-emerald-600', VOIDED: 'bg-red-500' };

// Status as black text with a coloured dot, translated (the shared Dot has English labels built in).
export const TxnStatus = ({ value }) => {
  const { t } = useTranslation('bankTransactions');
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

// Icon-only actions: View, Reconcile / Un-reconcile, Void. Used by this list and by BankTransactionsView.
// Ledger rows are never edited or deleted: a mistake is voided with a reason and stays on the record.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('bankTransactions');
  const { can } = useAuth();
  const navigate = useNavigate();
  const posted = r.status === 'POSTED';
  const linked = !!(r.customerPaymentId || r.paymentId);
  const reconcile = async () => {
    onError('');
    try { await bankTransactionApi.reconcile(r.id, !r.isReconciled); onChanged?.(r.isReconciled ? t('actions.markedNot') : t('actions.markedReconciled')); } catch (x) { onError(errMsg(x)); }
  };
  const voidIt = async () => {
    const note = r.transferGroupId ? t('actions.voidTransferNote') : '';
    const reason = askReason(`${t('actions.voidPrompt', { no: r.txnNo })}${note}`);
    if (!reason) return;
    onError('');
    try { await bankTransactionApi.voidTxn(r.id, reason); onChanged?.(t('actions.voided')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/bank-transactions/${r.id}`)}><EyeIcon /></IconBtn>}
      {posted && can('bank_transactions.reconcile') && (
        <IconBtn label={r.isReconciled ? t('actions.unreconcile') : t('actions.reconcile')} tone={r.isReconciled ? TONES.off : TONES.on} onClick={reconcile}>{r.isReconciled ? <XCircleIcon /> : <CheckCircleIcon />}</IconBtn>
      )}
      {posted && !linked && can('bank_transactions.void') && <IconBtn label={t('actions.void')} tone={TONES.del} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['txnNo', 'date', 'account', 'type', 'details', 'moneyIn', 'moneyOut', 'reconciled', 'status', 'actions'];

export default function BankTransactionsList() {
  const { t } = useTranslation('bankTransactions');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const transferGroupId = params.get('transferGroupId') || ''; const customerPaymentId = params.get('customerPaymentId') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ bankAccountId: params.get('bankAccountId') || '', type: '', direction: '', status: 'ALL', isReconciled: '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const accounts = useAccounts();
  const list = useLoad(() => bankTransactionApi.list({ page, limit: 25, ...(q && { search: q }), ...(transferGroupId && { transferGroupId }), ...(customerPaymentId && { customerPaymentId }),
    ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f, transferGroupId, customerPaymentId]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const scoped = transferGroupId || customerPaymentId;
  const filtered = q || scoped || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {can('bank_transactions.transfer') && <Link to="/bank-transactions/transfer" className="btn-ghost px-4 py-2 text-[14px] font-bold">{t('list.transfer')}</Link>}
          {can('bank_transactions.create') && <Link to="/bank-transactions/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-w-[16rem] flex-1"><AccountSelect accounts={accounts.data?.data} value={f.bankAccountId} onChange={setFilter('bankAccountId')} placeholder={t('list.allAccounts')} /></div>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterTypeAria')} value={f.type} onChange={setFilter('type')}>
          <option value="">{t('list.allTypes')}</option>{TYPE_CODES.map((k) => <option key={k} value={k}>{t(`type.${k}`)}</option>)}
        </select>
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterDirAria')} value={f.direction} onChange={setFilter('direction')}>
          <option value="">{t('list.inOut')}</option><option value="CREDIT">{t('list.moneyIn')}</option><option value="DEBIT">{t('list.moneyOut')}</option>
        </select>
        <select className="input max-w-[9rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          <option value="ALL">{t('status.ALL')}</option><option value="POSTED">{t('status.POSTED')}</option><option value="VOIDED">{t('status.VOIDED')}</option>
        </select>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterReconAria')} value={f.isReconciled} onChange={setFilter('isReconciled')}>
          <option value="">{t('list.reconOrNot')}</option><option value="true">{t('list.reconciled')}</option><option value="false">{t('list.notReconciled')}</option>
        </select>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
        {scoped && <button type="button" className="btn-ghost" onClick={() => { setParams({}); setPage(1); }}>{t('list.clearScoped')}</button>}
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => {
              const dead = r.status === 'VOIDED';
              return (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} whitespace-nowrap text-left`}>{r.txnNo}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.txnDate)}</td>
                  <td className={`${CELL} text-center`}>{r.account?.accountName || '—'}<div className="text-xs">{r.account?.bank?.name} · {r.account?.accountNo}</div></td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{t(`type.${r.type}`, { defaultValue: r.type })}</td>
                  <td className={`${CELL} text-center`}>{[r.reference, r.description, r.counterparty].filter(Boolean).join(' · ') || '—'}</td>
                  <td className={`${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`}>{r.direction === 'CREDIT' ? money(r.amount) : ''}</td>
                  <td className={`${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`}>{r.direction === 'DEBIT' ? money(r.amount) : ''}</td>
                  <td className={`${CELL} text-center`}>{r.isReconciled ? t('yes') : t('no')}</td>
                  <td className={`${CELL} text-center`}><TxnStatus value={r.status} /></td>
                  <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

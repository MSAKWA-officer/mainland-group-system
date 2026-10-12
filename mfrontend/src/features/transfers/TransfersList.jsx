import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, transferApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, EyeIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { AccountSelect, IconBtn, NOTICE, TONES, askReason, day, money, useAccounts } from '../banking/bankingUi.jsx';

export { NOTICE };

export const AccountCell = ({ a }) => (a ? <>{a.accountName}<div className="text-xs">{a.bank?.name} · {a.accountNo}</div></> : '—');

// Status as black text with a coloured dot, translated (the shared Dot has English labels built in).
// Labels come from locales/<lang>/transfers.json (status.<CODE>).
const DOTS = { POSTED: 'bg-emerald-600', VOIDED: 'bg-red-500' };
export const TransferStatus = ({ value }) => {
  const { t } = useTranslation('transfers');
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

// View + Void. Voiding a transfer voids both sides; the server refuses while either side is reconciled.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('transfers');
  const { can } = useAuth();
  const navigate = useNavigate();
  const voidIt = async () => {
    const reason = askReason(t('actions.voidPrompt', { amount: money(r.amount) }));
    if (!reason) return;
    onError('');
    try { await transferApi.voidTransfer(r.transferGroupId, reason); onChanged?.(t('actions.voided')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/transfers/${r.transferGroupId}`)}><EyeIcon /></IconBtn>}
      {r.status === 'POSTED' && can('transfers.void') && <IconBtn label={t('actions.void')} tone={TONES.del} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['date', 'fromAccount', 'toAccount', 'details', 'amount', 'doneBy', 'status', 'actions'];

export default function TransfersList() {
  const { t } = useTranslation('transfers');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ status: 'ALL', fromAccountId: '', toAccountId: '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const accounts = useAccounts();
  const list = useLoad(() => transferApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const filtered = q || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        {can('transfers.create') && <Link to="/transfers/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-w-[15rem] flex-1"><AccountSelect accounts={accounts.data?.data} value={f.fromAccountId} onChange={setFilter('fromAccountId')} placeholder={t('list.fromAny')} /></div>
        <div className="max-w-[15rem] flex-1"><AccountSelect accounts={accounts.data?.data} value={f.toAccountId} onChange={setFilter('toAccountId')} placeholder={t('list.toAny')} /></div>
        <select className="input max-w-[9rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          <option value="ALL">{t('status.ALL')}</option><option value="POSTED">{t('status.POSTED')}</option><option value="VOIDED">{t('status.VOIDED')}</option>
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
              <tr key={r.transferGroupId} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{day(r.txnDate)}</td>
                <td className={`${CELL} text-center`}><AccountCell a={r.from?.account} /></td>
                <td className={`${CELL} text-center`}><AccountCell a={r.to?.account} /></td>
                <td className={`${CELL} text-center`}>{[r.reference, r.description].filter(Boolean).join(' · ') || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center ${r.status === 'VOIDED' ? '!text-slate-500 line-through' : ''} !font-semibold`}>{money(r.amount)}</td>
                <td className={`${CELL} text-center`}>{r.creator?.fullName}</td>
                <td className={`${CELL} text-center`}><TransferStatus value={r.status} /></td>
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

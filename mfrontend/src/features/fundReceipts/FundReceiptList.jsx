import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fundReceiptApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, EyeIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { AccountSelect, IconBtn, NOTICE, TONES, askReason, day, money, useAccounts } from '../banking/bankingUi.jsx';

export const SOURCES = ['OWNER_CAPITAL', 'HEAD_OFFICE', 'LOAN', 'GRANT', 'OTHER'];
export const PURPOSES = ['FUEL', 'EXPENSES', 'OTHER'];
const DOTS = { POSTED: 'bg-emerald-600', VOIDED: 'bg-red-500' };

// Status as black text with a coloured dot, translated.
export const ReceiptStatus = ({ value }) => {
  const { t } = useTranslation('fundReceipts');
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[value] || 'bg-slate-400'}`} />{t(`status.${value}`, { defaultValue: value })}</span>;
};

// Icon-only actions: View and Void. Used by this list and by FundReceiptView.
// Receipts are never edited or deleted: a mistake is voided with a reason (the bank deposit is voided with it).
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('fundReceipts');
  const { can } = useAuth();
  const navigate = useNavigate();
  const voidIt = async () => {
    const reason = askReason(t('actions.voidPrompt', { no: r.receiptNo }));
    if (!reason) return;
    onError('');
    try { await fundReceiptApi.voidReceipt(r.id, reason); onChanged?.(t('actions.voided')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/fund-receipts/${r.id}`)}><EyeIcon /></IconBtn>}
      {r.status === 'POSTED' && can('fund_receipts.void') && <IconBtn label={t('actions.void')} tone={TONES.del} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const COLS = ['receiptNo', 'date', 'account', 'receivedFrom', 'source', 'purpose', 'amount', 'status', 'actions'];

export default function FundReceiptList() {
  const { t } = useTranslation('fundReceipts');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const accounts = useAccounts('TZS');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ bankAccountId: '', source: '', purpose: '', status: 'ALL', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => fundReceiptApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const sum = useLoad(() => fundReceiptApi.summary({ groupBy: 'purpose', ...(f.from && { from: f.from }), ...(f.to && { to: f.to }) }), [f.from, f.to, list.data]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const byPurpose = Object.fromEntries((sum.data?.rows || []).map((r) => [r.label, r.total]));
  const filtered = q || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
        </div>
        {can('fund_receipts.create') && <Link to="/fund-receipts/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('new')}</Link>}
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
        <div className="rounded-md border border-line p-3"><div className="text-xs uppercase">{t('stats.total')}</div><div className="mt-1 text-xl font-semibold">{money(sum.data?.total || 0)}</div></div>
        {PURPOSES.map((p) => <div key={p} className="rounded-md border border-line p-3"><div className="text-xs uppercase">{t(`purpose.${p}`)}</div><div className="mt-1 text-xl font-semibold">{money(byPurpose[p] || 0)}</div></div>)}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.search')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-w-[16rem] flex-1"><AccountSelect accounts={accounts.data?.data} value={f.bankAccountId} onChange={setFilter('bankAccountId')} placeholder={t('list.allAccounts')} /></div>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.allPurposes')} value={f.purpose} onChange={setFilter('purpose')}><option value="">{t('list.allPurposes')}</option>{PURPOSES.map((k) => <option key={k} value={k}>{t(`purpose.${k}`)}</option>)}</select>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('list.allSources')} value={f.source} onChange={setFilter('source')}><option value="">{t('list.allSources')}</option>{SOURCES.map((k) => <option key={k} value={k}>{t(`source.${k}`)}</option>)}</select>
        <select className="input max-w-[9rem] !text-[14px] !text-[#212121]" aria-label={t('list.status')} value={f.status} onChange={setFilter('status')}><option value="ALL">{t('status.ALL')}</option><option value="POSTED">{t('status.POSTED')}</option><option value="VOIDED">{t('status.VOIDED')}</option></select>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${i === 0 ? 'text-left' : 'text-center'}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => {
              const dead = r.status === 'VOIDED';
              return (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} whitespace-nowrap text-left`}>{r.receiptNo}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.receiptDate)}</td>
                  <td className={`${CELL} text-center`}>{r.bankAccount?.accountName || '—'}<div className="text-xs">{r.bankAccount?.bank?.name} · {r.bankAccount?.accountNo}</div></td>
                  <td className={`${CELL} text-center`}>{r.receivedFrom}{r.reference && <div className="text-xs">{r.reference}</div>}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{t(`source.${r.source}`, { defaultValue: r.source })}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{t(`purpose.${r.purpose}`, { defaultValue: r.purpose })}</td>
                  <td className={`${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`}>{money(r.amount)}</td>
                  <td className={`${CELL} text-center`}><ReceiptStatus value={r.status} /></td>
                  <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span>{tc('records', { total })}{list.data && <> · {t('list.postedTotal')}: <b>{money(list.data.postedTotal)}</b></>}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { bankAccountApi, bankApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';
import { IconBtn, NOTICE, Status, TONES } from '../banks/BanksList.jsx';

export { NOTICE, Status };
// Amounts follow the selected language (en-GB / sw-TZ / zh-CN).
export const money = (v) => Number(v || 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Account type codes; the labels come from locales/<lang>/bankAccounts.json (type.<CODE>).
export const TYPE_CODES = ['CURRENT', 'SAVINGS', 'MOBILE_MONEY', 'OTHER'];

// Icon-only actions: View, Edit, Activate / Deactivate, Delete. Used by this list and by BankAccountsView.
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('bankAccounts');
  const { can } = useAuth();
  const navigate = useNavigate();
  const label = `${r.accountNo} (${r.accountName})`;
  const toggle = async () => {
    let body = { isActive: true };
    if (r.isActive) {
      const reason = window.prompt(t('actions.deactivatePrompt', { label }));
      if (!reason || !reason.trim()) return;
      body = { isActive: false, reason: reason.trim() };
    }
    onError('');
    try { await bankAccountApi.setStatus(r.id, body); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('actions.deleteConfirm', { label }))) return;
    onError('');
    try { await bankAccountApi.remove(r.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/bank-accounts/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('bank_accounts.update') && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/bank-accounts/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('bank_accounts.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('bank_accounts.delete') && <IconBtn label={t('actions.delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function BankAccountsList() {
  const { t } = useTranslation('bankAccounts');
  const { t: tb } = useTranslation('banks');      // Active / Inactive labels
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [f, setF] = useState({ bankId: '', accountType: '', currency: '', isActive: '' });
  const [err, setErr] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const banks = useLoad(() => (can('banks.read') ? bankApi.list({ limit: 100 }) : Promise.resolve(null)), []);
  const list = useLoad(() => bankAccountApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const showBal = rows.some((r) => r.balance !== undefined);          // the server only sends balances to users with bank_accounts.view_balance
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const keys = ['accountNo', 'accountName', 'bank', 'type', 'currency', ...(showBal ? ['balance'] : []), 'status', 'actions'];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle', { total })}</p>
        </div>
        {can('bank_accounts.create') && <Link to="/bank-accounts/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        {banks.data && (
          <select className="input max-w-[13rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterBankAria')} value={f.bankId} onChange={setFilter('bankId')}>
            <option value="">{t('list.allBanks')}</option>{banks.data.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterTypeAria')} value={f.accountType} onChange={setFilter('accountType')}>
          <option value="">{t('list.allTypes')}</option>{TYPE_CODES.map((k) => <option key={k} value={k}>{t(`type.${k}`)}</option>)}
        </select>
        <input className="input max-w-[7rem] uppercase !text-[14px] !text-[#212121]" placeholder={t('list.currency')} aria-label={t('list.filterCurrencyAria')} maxLength={3} value={f.currency}
          onChange={(e) => { const v = e.target.value.toUpperCase(); if (v.length === 0 || v.length === 3) { setF({ ...f, currency: v }); setPage(1); } else setF({ ...f, currency: v }); }} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.isActive} onChange={setFilter('isActive')}>
          <option value="">{t('list.allStatuses')}</option><option value="true">{tb('status.ACTIVE')}</option><option value="false">{tb('status.INACTIVE')}</option>
        </select>
      </div>
      {(err || list.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{keys.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={keys.length}>{q || Object.values(f).some(Boolean) ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.accountNo}</td>
                <td className={`${CELL} text-center`}>{r.accountName}</td>
                <td className={`${CELL} text-center`}>{r.bank?.name || '—'}</td>
                <td className={`${CELL} text-center`}>{t(`type.${r.accountType}`, { defaultValue: r.accountType })}</td>
                <td className={`${CELL} text-center`}>{r.currency}</td>
                {showBal && <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.balance)}</td>}
                <td className={`${CELL} text-center`}><Status active={r.isActive} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={list.reload} onError={setErr} /></div></td>
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

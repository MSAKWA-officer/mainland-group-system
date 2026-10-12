import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, salespersonApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, Status, money } from '../customers/CustomersList.jsx';

export { NOTICE, Status, money };

const IconBtn = ({ label, onClick, tone, children }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${tone}`}>
    {children}
  </button>
);
const TONES = {
  view: 'border-blue-200 text-blue-600 hover:bg-blue-50',
  edit: 'border-amber-200 text-amber-600 hover:bg-amber-50',
  off: 'border-slate-300 text-slate-600 hover:bg-slate-100',
  on: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50',
  del: 'border-red-200 text-red-600 hover:bg-red-50',
};

// Icon-only actions: View, Edit, Activate / Deactivate, Delete. Used by this list and by SalespersonsView.
// Buttons are shown by permission (the API enforces the same rules).
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('salespersons');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const navigate = useNavigate();
  const toggle = async () => {
    let body = { isActive: true };
    if (r.isActive) {
      const reason = window.prompt(t('actions.deactivatePrompt', { name: r.fullName }));
      if (!reason || !reason.trim()) return;
      body = { isActive: false, reason: reason.trim() };
    }
    onError('');
    try { await salespersonApi.setStatus(r.id, body); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('actions.confirmDelete', { name: r.fullName }))) return;
    onError('');
    try { await salespersonApi.remove(r.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={tc('view')} tone={TONES.view} onClick={() => navigate(`/salespersons/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('salespersons.update') && <IconBtn label={tc('edit')} tone={TONES.edit} onClick={() => navigate(`/salespersons/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('salespersons.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('salespersons.delete') && <IconBtn label={tc('delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function SalespersonsList() {
  const { t } = useTranslation('salespersons');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const list = useLoad(() => salespersonApi.list({ page, limit: 25, ...(q && { search: q }), ...(status && { isActive: status }) }), [page, q, status]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  // Commission is only returned to users allowed to see it, so the column is shown only when it is present.
  const showPay = can('salespersons.view_commission');
  const heads = ['code', 'name', 'region', 'phone', 'loginAccount', 'customers', 'orders', ...(showPay ? ['commission', 'target'] : []), 'status', 'actions'].map((k) => t(`columns.${k}`));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { count: total })}</p>
        </div>
        {can('salespersons.create') && <Link to="/salespersons/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('newButton')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatusAria')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('allStatuses')}</option><option value="true">{tc('active')}</option><option value="false">{tc('inactive')}</option>
        </select>
      </div>
      {(err || list.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{q || status ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.code}</td>
                <td className={`${CELL} text-center`}>{r.fullName}{r.email && <div className="text-xs font-normal">{r.email}</div>}</td>
                <td className={`${CELL} text-center`}>{r.region || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.phone || '—'}</td>
                <td className={`${CELL} text-center`}>{r.user?.username || '—'}</td>
                <td className={`${CELL} text-center`}>{r.customerCount}</td>
                <td className={`${CELL} text-center`}>{r.orderCount}</td>
                {showPay && <td className={`${CELL} whitespace-nowrap text-center`}>{r.commissionRate != null ? `${Number(r.commissionRate)}%` : '—'}</td>}
                {showPay && <td className={`${CELL} whitespace-nowrap text-center`}>{r.monthlyTarget != null ? money(r.monthlyTarget) : '—'}</td>}
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

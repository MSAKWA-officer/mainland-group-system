import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { customerApi, errMsg, salespersonApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';

// Banners keep their light background but their text is black.
export const NOTICE = '[&>div]:!text-black';
// Customer type codes. The visible names live in i18n/locales/<lang>/customers.json under "types".
export const TYPES = ['INDIVIDUAL', 'COMPANY'];
export const money = (v) => Number(v || 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Status as black text with a coloured dot (text itself stays black).
export const Status = ({ active }) => {
  const { t } = useTranslation('common');
  return (
    <span className="inline-flex items-center gap-2 text-black">
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-600' : 'bg-slate-400'}`} />{active ? t('active') : t('inactive')}
    </span>
  );
};

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

// Icon-only actions: View, Edit, Activate / Deactivate, Delete. Used by this list and by CustomersView.
// Buttons are shown by permission (the API enforces the same rules).
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('customers');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const navigate = useNavigate();
  const toggle = async () => {
    let body = { isActive: true };
    if (r.isActive) {
      const reason = window.prompt(t('actions.deactivatePrompt', { name: r.name }));
      if (!reason || !reason.trim()) return;
      body = { isActive: false, reason: reason.trim() };
    }
    onError('');
    try { await customerApi.setStatus(r.id, body); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('actions.confirmDelete', { name: r.name }))) return;
    onError('');
    try { await customerApi.remove(r.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={tc('view')} tone={TONES.view} onClick={() => navigate(`/customers/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('customers.update') && <IconBtn label={tc('edit')} tone={TONES.edit} onClick={() => navigate(`/customers/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('customers.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('customers.delete') && <IconBtn label={tc('delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function CustomersList() {
  const { t } = useTranslation('customers');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [sp, setSp] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const canFilterSp = can('salespersons.read') && can('customers.read_all');
  const sps = useLoad(() => (canFilterSp ? salespersonApi.list({ limit: 100 }) : Promise.resolve(null)), [canFilterSp]);
  const list = useLoad(() => customerApi.list({ page, limit: 25, ...(q && { search: q }), ...(type && { type }), ...(status && { isActive: status }), ...(sp && { salespersonId: sp }) }),
    [page, q, type, status, sp]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { count: total })}</p>
        </div>
        {can('customers.create') && <Link to="/customers/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('newButton')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('filterTypeAria')} value={type} onChange={reset(setType)}>
          <option value="">{t('allTypes')}</option>{TYPES.map((k) => <option key={k} value={k}>{t(`types.${k}`)}</option>)}
        </select>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatusAria')} value={status} onChange={reset(setStatus)}>
          <option value="">{t('allStatuses')}</option><option value="true">{tc('active')}</option><option value="false">{tc('inactive')}</option>
        </select>
        {canFilterSp && (
          <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('filterSalespersonAria')} value={sp} onChange={reset(setSp)}>
            <option value="">{t('allSalespersons')}</option>{(sps.data?.data || []).map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
        )}
      </div>
      {(err || list.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{['code', 'name', 'type', 'phone', 'city', 'salesperson', 'orders', 'status', 'actions'].map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={9}>{q || type || status || sp ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.code}</td>
                <td className={`${CELL} text-center`}>{r.name}{r.contactPerson && <div className="text-xs font-normal">{r.contactPerson}</div>}</td>
                <td className={`${CELL} text-center`}>{t(`types.${r.type}`, { defaultValue: r.type })}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.phone || '—'}</td>
                <td className={`${CELL} text-center`}>{r.city || '—'}</td>
                <td className={`${CELL} text-center`}>{r.salesperson?.fullName || '—'}</td>
                <td className={`${CELL} text-center`}>{r.orderCount}</td>
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

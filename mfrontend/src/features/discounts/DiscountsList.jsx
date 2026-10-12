import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { discountApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';

// Banners keep their light background but their text is black.
export const NOTICE = '[&>div]:!text-black';
// Scope codes; the labels come from locales/<lang>/discounts.json (scope.<CODE>).
export const SCOPE_CODES = ['ALL', 'CATEGORY', 'ITEM'];
// Numbers and dates follow the selected language (en-GB / sw-TZ / zh-CN).
export const money = (v) => Number(v || 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (v) => Number(v || 0).toLocaleString(currentLocale(), { maximumFractionDigits: 3 });
export const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(currentLocale(), { dateStyle: 'medium' }) : '—');
export const todayStr = () => new Date().toLocaleDateString('en-CA');           // YYYY-MM-DD in the browser's local day

// What the discount is applied to, as text. `t` is the translate function of the 'discounts' namespace.
export const target = (r, t) => (r.scope === 'ITEM' ? (r.item ? `${r.item.name} (${r.item.sku})` : t('fallback.item'))
  : r.scope === 'CATEGORY' ? (r.category?.name || t('fallback.category')) : t('scope.ALL'));

// INACTIVE / EXPIRED / SCHEDULED / ACTIVE, derived from the flag and the dates. Returns [code, dot colour].
export const stateOf = (r) => {
  const today = todayStr();
  if (!r.isActive) return ['INACTIVE', 'bg-slate-400'];
  if (r.validTo && r.validTo < today) return ['EXPIRED', 'bg-red-500'];
  if (r.validFrom > today) return ['SCHEDULED', 'bg-amber-500'];
  return ['ACTIVE', 'bg-emerald-600'];
};
// Status as black text with a coloured dot.
export const Status = ({ r }) => {
  const { t } = useTranslation('discounts');
  const [code, dot] = stateOf(r);
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 rounded-full ${dot}`} />{t(`state.${code}`)}</span>;
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

// Icon-only actions: View, Edit, Activate / Deactivate, Delete. Used by this list and by DiscountsView.
// Buttons are shown by permission (the API enforces the same rules).
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('discounts');
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
    try { await discountApi.setStatus(r.id, body); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('actions.deleteConfirm', { name: r.name }))) return;
    onError('');
    try { await discountApi.remove(r.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/discounts/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('discounts.update') && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/discounts/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('discounts.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('discounts.delete') && <IconBtn label={t('actions.delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['code', 'name', 'percent', 'appliesTo', 'customer', 'minQty', 'valid', 'used', 'status', 'actions'];

export default function DiscountsList() {
  const { t } = useTranslation('discounts');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [scope, setScope] = useState('');
  const [view, setView] = useState('');                 // '' = all, 'current' = usable today, 'true' / 'false' = active flag
  const [err, setErr] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => discountApi.list({ page, limit: 25, ...(q && { search: q }), ...(scope && { scope }),
    ...(view === 'current' ? { current: true } : view ? { isActive: view } : {}) }), [page, q, scope, view]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle', { total })}</p>
        </div>
        {can('discounts.create') && <Link to="/discounts/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterScopeAria')} value={scope} onChange={reset(setScope)}>
          <option value="">{t('list.allScopes')}</option>{SCOPE_CODES.map((k) => <option key={k} value={k}>{t(`scope.${k}`)}</option>)}
        </select>
        <select className="input max-w-[13rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={view} onChange={reset(setView)}>
          <option value="">{t('list.allStatuses')}</option><option value="current">{t('list.usable')}</option><option value="true">{t('list.active')}</option><option value="false">{t('list.inactive')}</option>
        </select>
      </div>
      {(err || list.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{q || scope || view ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.code}</td>
                <td className={`${CELL} text-center`}>{r.name}{r.description && <div className="text-xs font-normal">{r.description}</div>}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.percent)}%</td>
                <td className={`${CELL} text-center`}>{target(r, t)}<div className="text-xs">{t(`scope.${r.scope}`, { defaultValue: r.scope })}</div></td>
                <td className={`${CELL} text-center`}>{r.customer ? r.customer.name : t('anyCustomer')}</td>
                <td className={`${CELL} text-center`}>{Number(r.minQuantity) ? qty(r.minQuantity) : '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.validFrom)} → {r.validTo ? day(r.validTo) : t('noEnd')}</td>
                <td className={`${CELL} text-center`}>{r.usageCount ?? 0}</td>
                <td className={`${CELL} text-center`}><Status r={r} /></td>
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

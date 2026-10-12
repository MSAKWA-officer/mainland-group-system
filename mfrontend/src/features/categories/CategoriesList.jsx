import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { categoryApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';

// Banners keep their light background but their text is black.
export const NOTICE = '[&>div]:!text-black';

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
  del: 'border-red-200 text-red-600 hover:bg-red-50',
};

// Icon-only actions: View, Edit, Delete. Used by this list and by CategoriesView.
// Buttons are shown by permission (the API enforces the same rules).
export function RowActions({ r, showView, onError, afterDelete }) {
  const { t } = useTranslation('categories');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const navigate = useNavigate();
  const remove = async () => {
    if (!window.confirm(t('confirmDelete', { name: r.name }))) return;
    onError('');
    try { await categoryApi.remove(r.id); afterDelete?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={tc('view')} tone={TONES.view} onClick={() => navigate(`/categories/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('categories.update') && <IconBtn label={tc('edit')} tone={TONES.edit} onClick={() => navigate(`/categories/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('categories.delete') && <IconBtn label={tc('delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;

export default function CategoriesList() {
  const { t } = useTranslation('categories');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const list = useLoad(() => categoryApi.list({ page, limit: 25, ...(q && { search: q }), ...(status && { isActive: status }) }), [page, q, status]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { total })}</p>
        </div>
        {can('categories.create') && <Link to="/categories/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('newButton')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px]" placeholder={t('searchPlaceholder')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px]" aria-label={t('filterStatusAria')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('allStatuses')}</option><option value="true">{tc('active')}</option><option value="false">{tc('inactive')}</option>
        </select>
      </div>
      {(err || list.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['name', 'parent', 'description', 'items', 'status', 'created', 'actions'].map((h, i) => (
                <th key={h} className={`${HEAD} ${i === 0 ? 'text-left' : 'text-center'}`}>{t(`columns.${h}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!list.loading && rows.length === 0 && (
              <tr><td className={`${CELL} text-left`} colSpan={7}>{q || status ? t('emptyFiltered') : t('emptyNone')}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} text-left`}>{r.name}</td>
                <td className={`${CELL} text-center`}>{r.parent?.name || '—'}</td>
                <td className={`${CELL} max-w-xs text-center`}>{r.description || '—'}</td>
                <td className={`${CELL} text-center`}>{r.itemCount}</td>
                <td className={`${CELL} text-center`}><Status active={r.isActive} /></td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{fmt(r.createdAt)}</td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onError={setErr} afterDelete={list.reload} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-[14px]">
        <span>{tc('records', { total })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost !text-[14px]" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost !text-[14px]" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

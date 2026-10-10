import { Fragment, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { categoryApi, itemApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, TrashIcon, BanIcon, CheckCircleIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { currentLocale } from '../../utils/locale';

export const money = (v) => (v === undefined || v === null || v === '' ? '—' : Number(v).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const qty = (v) => (v === undefined || v === null || v === '' ? '0' : Number(v).toLocaleString(currentLocale(), { maximumFractionDigits: 3 }));

// Icon-only action button. title + aria-label keep the meaning available on hover and for screen readers.
function IconBtn({ label, onClick, danger, children }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${danger ? 'text-red-600' : 'text-blue-600'}`}>
      {children}
    </button>
  );
}

// Icon actions. Used by this list and by ItemsView. Shown by permission (the API enforces the same rules).
export function RowActions({ i, showView, onChanged, onError, onMsg, afterDelete }) {
  const { t } = useTranslation('items');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const navigate = useNavigate();
  const run = async (fn) => { onError(''); onMsg?.(''); try { await fn(); onChanged?.(); } catch (x) { onError(errMsg(x)); } };

  const toggle = () => run(async () => {
    if (i.isActive) {
      const reason = window.prompt(t('actions.deactivatePrompt', { name: i.name })); if (!reason) return;
      await itemApi.setStatus(i.id, { isActive: false, reason });
    } else await itemApi.setStatus(i.id, { isActive: true });
  });
  const remove = async () => {
    if (!window.confirm(t('actions.confirmDelete', { name: i.name, sku: i.sku }))) return;
    onError('');
    try { await itemApi.remove(i.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };

  return (
    <div className="flex items-center gap-1">
      {showView && <IconBtn label={tc('view')} onClick={() => navigate(`/items/${i.id}`)}><EyeIcon /></IconBtn>}
      {can('items.update') && <IconBtn label={tc('edit')} onClick={() => navigate(`/items/${i.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('items.deactivate') && <IconBtn label={i.isActive ? t('actions.deactivate') : t('actions.activate')} onClick={toggle}>{i.isActive ? <BanIcon /> : <CheckCircleIcon />}</IconBtn>}
      {can('items.delete') && <IconBtn label={tc('delete')} danger onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

/* ---------- table style (matches the reference: Helvetica/Arial 14px, light-grey grid, bold headers) ---------- */
const FONT = { fontFamily: 'Arial, Helvetica, sans-serif' };
const GRID = 'border-[#e5e7eb]';
const head = `border ${GRID} h-[39px] px-3 py-2 text-[14px] font-semibold uppercase leading-5 text-[#212121]`;
const cell = `border ${GRID} h-[39px] px-3 py-2 align-middle text-[14px] leading-5 text-[#212121]`;

// The table shows this many data columns. Any further columns move into the "More" column,
// where a button opens them under the row. To show more or fewer columns, change this number.
const MAX_VISIBLE = 6;

// Every column the list can show, in priority order. `perm` hides a column from users who lack that permission.
// `link` makes the cell open the item (blue, like the first column in the reference).
const COLUMNS = [
  { key: 'sku', labelKey: 'sku', link: true, cell: (i) => i.sku },
  { key: 'name', labelKey: 'name', cell: (i) => <><div>{i.name}</div>{i.barcode && <div className="text-xs">{i.barcode}</div>}</> },
  { key: 'category', labelKey: 'category', cell: (i) => i.category?.name || '—' },
  { key: 'stock', labelKey: 'stock', align: 'right', cell: (i) => `${qty(i.stock?.quantity)} ${i.unit || ''}`.trim() },
  { key: 'price', labelKey: 'sellingPrice', align: 'right', cell: (i) => money(i.sellingPrice) },
  { key: 'status', labelKey: 'status', align: 'center', cell: (i, t) => (i.isActive ? t('common:active') : t('common:inactive')) },
  // ---- beyond six: shown through the More button ----
  { key: 'unit', labelKey: 'unit', cell: (i) => i.unit || '—' },
  { key: 'cost', labelKey: 'costPrice', perm: 'items.view_cost', cell: (i) => money(i.costPrice) },
  { key: 'reorder', labelKey: 'reorder', cell: (i) => qty(i.reorderLevel) },
  { key: 'expiry', labelKey: 'trackExpiry', cell: (i, t) => (i.trackExpiry ? t('yes') : t('no')) },
  { key: 'description', labelKey: 'description', cell: (i) => i.description || '—' },
  { key: 'created', labelKey: 'created', cell: (i) => fmt(i.createdAt) },
];

export default function ItemsList() {
  const { t } = useTranslation('items');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [categoryId, setCategoryId] = useState('');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(location.state?.msg || '');
  const [expanded, setExpanded] = useState({}); // item id -> true while its extra details are open
  const cats = useLoad(() => categoryApi.list({ limit: 500 }), []);
  const list = useLoad(() => itemApi.list({ page, search: search || undefined, categoryId: categoryId || undefined }), [page, search, categoryId]);
  const rows = list.data?.data || [];

  const allowed = COLUMNS.filter((c) => !c.perm || can(c.perm));
  const visible = allowed.slice(0, MAX_VISIBLE);
  const extra = allowed.slice(MAX_VISIBLE);
  const hasMore = extra.length > 0;
  const span = visible.length + (hasMore ? 1 : 0) + 1; // data columns + More + Actions

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const total = list.data?.total ?? 0; const limit = list.data?.limit ?? 1;

  return (
    <div className="panel overflow-hidden text-[14px] text-[#212121] shadow-sm" style={FONT}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm">{t('registered', { total })}</p>
        </div>
        {can('items.create') && <Link to="/items/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('addButton')}</Link>}
      </div>

      <div className="px-4">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner>
        <div className="mb-4 flex flex-wrap gap-3">
          <input className="input max-w-xs !text-black placeholder:text-black/70" placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
          <select className="input max-w-xs !text-black" value={categoryId} onChange={(e) => { setPage(1); setCategoryId(e.target.value); }}>
            <option value="">{t('allCategories')}</option>
            {(cats.data?.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto px-4">
        <table className={`w-full border-collapse border ${GRID} bg-white`}>
          <thead>
            <tr>
              {visible.map((c, idx) => <th key={c.key} className={`${head} ${idx === 0 ? 'text-left' : 'text-center'}`}>{t(`fields.${c.labelKey}`)}</th>)}
              {hasMore && <th className={`${head} text-center`}>{t('more')}</th>}
              <th className={`${head} text-center`}>{tc('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={cell} colSpan={span}>{t('empty')}</td></tr>}
            {rows.map((i) => {
              const open = !!expanded[i.id];
              return (
                <Fragment key={i.id}>
                  <tr>
                    {visible.map((c, idx) => (
                      <td key={c.key} className={`${cell} ${idx === 0 ? 'text-left' : 'text-center'}`}>
                        {c.link ? <Link to={`/items/${i.id}`} className="whitespace-nowrap text-[#337ab7] hover:underline">{c.cell(i, t)}</Link> : c.cell(i, t)}
                      </td>
                    ))}
                    {hasMore && (
                      <td className={`${cell} text-center`}>
                        <button type="button" onClick={() => toggle(i.id)} aria-expanded={open} aria-controls={`item-more-${i.id}`}
                          className="rounded-md border border-blue-600 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                          {open ? t('less') : t('more')}
                        </button>
                      </td>
                    )}
                    <td className={`${cell} text-center`}><div className="flex justify-center"><RowActions i={i} showView onChanged={list.reload} onError={setErr} onMsg={setMsg} /></div></td>
                  </tr>
                  {hasMore && open && (
                    <tr id={`item-more-${i.id}`}>
                      <td colSpan={span} className={`border ${GRID} bg-[#f9f9f9] px-3 py-3 text-[14px] text-[#212121]`}>
                        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                          {extra.map((c) => (
                            <div key={c.key}>
                              <dt className="font-bold">{t(`fields.${c.labelKey}`)}</dt>
                              <dd className="mt-0.5">{c.cell(i, t)}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {list.data && (
        <div className="flex items-center justify-between px-4 py-3 text-[14px] text-[#212121]">
          <span>{tc('records', { total })}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
            <button type="button" className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

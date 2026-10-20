import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { categoryApi, stockApi, warehouseApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, PencilIcon, TrashIcon, BanIcon, CheckIcon, XIcon, SendIcon, SlidersIcon, MoreIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { currentLocale } from '../../utils/locale';
import { useDocText } from '../../utils/docText';

export const qty = (v) => (v === undefined || v === null || v === '' ? '0' : Number(v).toLocaleString(currentLocale(), { maximumFractionDigits: 3 }));
export const STATUS = { DRAFT: 'Draft', SUBMITTED: 'Submitted', POSTED: 'Posted', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
export const Tag = ({ children }) => <span className="inline-block rounded border border-black/30 px-2 py-0.5 text-xs">{children}</span>;

// Icon-only action button. title + aria-label keep the meaning available on hover and for screen readers.
export function IconBtn({ label, onClick, danger, children }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${danger ? 'text-red-600' : 'text-blue-600'}`}>
      {children}
    </button>
  );
}

// Icon actions for one stock adjustment. Used by this list and by StockView.
// Rules mirror the API: only the creator edits / submits / cancels, approvers never act on their own document,
// and only draft, cancelled or rejected documents can be deleted (by the creator or the Owner).
export function RowActions({ d, showView, onChanged, onError, afterDelete }) {
  const { t } = useDocText();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = d.createdBy === user.id;
  const run = async (fn) => { onError(''); try { await fn(); onChanged?.(); } catch (x) { onError(errMsg(x)); } };
  const act = (action, body) => run(() => stockApi.actAdjustment(d.id, action, body));
  const remove = async () => {
    if (!window.confirm(t('confirmDelete', { docNo: d.docNo }))) return;
    onError('');
    try { await stockApi.removeAdjustment(d.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  const canDelete = can('adjustments.create') && (mine || user.role === 'OWNER') && ['DRAFT', 'CANCELLED', 'REJECTED'].includes(d.status);
  return (
    <div className="flex items-center gap-1">
      {showView && <IconBtn label={t('actions.view')} onClick={() => navigate(`/stock/${d.id}`)}><EyeIcon /></IconBtn>}
      {mine && d.status === 'DRAFT' && <IconBtn label={t('actions.edit')} onClick={() => navigate(`/stock/${d.id}/edit`)}><PencilIcon /></IconBtn>}
      {mine && d.status === 'DRAFT' && <IconBtn label={t('actions.submit')} onClick={() => act('submit')}><SendIcon /></IconBtn>}
      {mine && ['DRAFT', 'SUBMITTED'].includes(d.status) && <IconBtn label={t('actions.cancel')} onClick={() => act('cancel')}><BanIcon /></IconBtn>}
      {!mine && d.status === 'SUBMITTED' && can('adjustments.approve') && <IconBtn label={t('actions.approve')} onClick={() => act('approve', {})}><CheckIcon /></IconBtn>}
      {!mine && d.status === 'SUBMITTED' && can('adjustments.approve') && (
        <IconBtn label={t('actions.reject')} danger onClick={() => { const note = window.prompt(t('rejectPrompt')); if (note) act('reject', { note }); }}><XIcon /></IconBtn>
      )}
      {canDelete && <IconBtn label={t('actions.delete')} danger onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

// Warehouse filter shared by both tabs. Manager / Owner can pick "All warehouses" (company total); everybody else only sees the warehouses
// they work in, and with a single one it is chosen for them. The API enforces the same rule, this only shapes the dropdown.
function WarehouseSelect({ warehouses, value, onChange, canAll }) {
  const { t } = useTranslation('stock');
  if (!warehouses.length && !canAll) return null;
  return (
    <select className="input max-w-xs !text-[14px] !text-[#212121]" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('filters.warehouse')}>
      {(canAll || warehouses.length > 1) && <option value="">{canAll ? t('filters.allWarehouses') : t('filters.allMyWarehouses')}</option>}
      {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
    </select>
  );
}

function LevelsTable({ onError, warehouseId, warehouses, whControl }) {
  const { t } = useTranslation('stock');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(''); const [status, setStatus] = useState('');
  const [open, setOpen] = useState({});
  const cats = useLoad(() => categoryApi.list({ limit: 500 }), []);
  const list = useLoad(() => stockApi.list({ page, search: search || undefined, categoryId: categoryId || undefined, status: status || undefined, warehouseId: warehouseId || undefined }), [page, search, categoryId, status, warehouseId]);
  useEffect(() => { setPage(1); setOpen({}); }, [warehouseId]);
  const rows = list.data?.data || [];
  const canSetReorder = !!warehouseId && can('warehouses.update');
  const heads = ['sku', 'item', 'category', 'unit', 'inStock', 'reorder', 'level', 'actions'].map((k) => t(`levelsCols.${k}`));
  const level = (r) => (Number(r.quantity) === 0 ? t('level.out') : Number(r.item.reorderLevel) > 0 && Number(r.quantity) <= Number(r.item.reorderLevel) ? t('level.low') : t('level.in'));
  const reset = (set) => (e) => { setPage(1); set(e.target.value); };
  // Reorder level of this item in the chosen warehouse. Empty answer = go back to the item's own default level.
  const editReorder = async (r) => {
    const cur = r.reorderCustom ? String(Number(r.item.reorderLevel)) : '';
    const ans = window.prompt(t('reorder.prompt', { item: r.item.name, default: qty(r.item.itemReorderLevel) }), cur);
    if (ans === null) return;
    const txt = ans.trim().replace(',', '.');
    const val = txt === '' ? null : Number(txt);
    if (val !== null && (!Number.isFinite(val) || val < 0)) { onError(t('reorder.invalid')); return; }
    onError('');
    try { await warehouseApi.setReorderLevel(warehouseId, r.itemId, val); list.reload(); } catch (x) { onError(errMsg(x)); }
  };
  const wname = (warehouses.find((w) => w.id === warehouseId) || {}).name;
  return (
    <>
      <div className="px-4">
        <Banner>{list.error}</Banner>
        <div className="mb-4 flex flex-wrap gap-3">
          <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('filters.searchLevels')} value={search} onChange={reset(setSearch)} />
          {whControl}
          <select className="input max-w-xs !text-[14px] !text-[#212121]" value={categoryId} onChange={reset(setCategoryId)}>
            <option value="">{t('filters.allCategories')}</option>
            {(cats.data?.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input max-w-xs !text-[14px] !text-[#212121]" value={status} onChange={reset(setStatus)}>
            <option value="">{t('filters.allLevels')}</option><option value="in_stock">{t('level.in')}</option><option value="low">{t('level.low')}</option><option value="out">{t('level.out')}</option>
          </select>
        </div>
        {list.data?.message && <p className="mb-3 text-[14px]">{t('noWarehouse')}</p>}
        {wname && <p className="mb-3 text-[14px]">{t('showingWarehouse', { name: wname })}</p>}
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{t('empty.levels')}</td></tr>}
            {rows.map((r) => {
              const canOpen = !warehouseId && r.warehouses.length > 0;
              return (
                <Fragment key={r.itemId}>
                  <tr className="bg-white">
                    <td className={`${CELL} whitespace-nowrap text-left`}>{r.item.sku}</td>
                    <td className={`${CELL} text-center`}>{r.item.name}</td>
                    <td className={`${CELL} text-center`}>{r.item.category?.name || '—'}</td>
                    <td className={`${CELL} text-center`}>{r.item.unit}</td>
                    <td className={`${CELL} text-center`}>{qty(r.quantity)}</td>
                    <td className={`${CELL} text-center`}>
                      {qty(r.item.reorderLevel)}
                      {r.reorderCustom && <span className="ml-1 text-xs opacity-70" title={t('reorder.customHint', { default: qty(r.item.itemReorderLevel) })}>*</span>}
                      {canSetReorder && <IconBtn label={t('reorder.edit')} onClick={() => editReorder(r)}><PencilIcon /></IconBtn>}
                    </td>
                    <td className={`${CELL} text-center`}><Tag>{level(r)}</Tag></td>
                    <td className={`${CELL} text-center`}>
                      <div className="flex items-center justify-center gap-1">
                        {can('items.read') && <IconBtn label={t('rowActions.viewItem')} onClick={() => navigate(`/items/${r.itemId}`)}><EyeIcon /></IconBtn>}
                        {can('adjustments.create') && <IconBtn label={t('rowActions.adjustStock')} onClick={() => navigate(`/stock/new?itemId=${r.itemId}${warehouseId ? `&warehouseId=${warehouseId}` : ''}`)}><SlidersIcon /></IconBtn>}
                        {!warehouseId && (canOpen
                          ? <IconBtn label={t('breakdown.toggle')} onClick={() => setOpen({ ...open, [r.itemId]: !open[r.itemId] })}><MoreIcon /></IconBtn>
                          : <span className="inline-block h-8 w-8" />)}
                      </div>
                    </td>
                  </tr>
                  {canOpen && open[r.itemId] && (
                    <tr className="bg-slate-50">
                      <td className={`${CELL} text-left`} colSpan={heads.length}>
                        <span className="font-semibold">{t('breakdown.title')}:</span>{' '}
                        {r.warehouses.map((w, n) => <span key={w.id}>{n > 0 && ' · '}{w.name} <b>{qty(w.quantity)}</b></span>)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </>
  );
}

function AdjustmentsTable({ onError, err, warehouseId, whControl }) {
  const { t, status: statusText } = useDocText();
  const { t: ts } = useTranslation('stock');
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const list = useLoad(() => stockApi.listAdjustments({ page, search: search || undefined, status: status || undefined, warehouseId: warehouseId || undefined }), [page, search, status, warehouseId]);
  useEffect(() => { setPage(1); }, [warehouseId]);
  const rows = list.data?.data || [];
  const heads = ['docNo', 'date', 'warehouse', 'reference', 'reason', 'lines', 'createdBy', 'status', 'actions'].map((k) => ts(`adjCols.${k}`));
  return (
    <>
      <div className="px-4">
        <Banner>{err || list.error}</Banner>
        <div className="mb-4 flex flex-wrap gap-3">
          <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={ts('filters.searchAdj')} value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
          {whControl}
          <select className="input max-w-xs !text-[14px] !text-[#212121]" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">{ts('filters.allStatuses')}</option>
            {Object.keys(STATUS).map((k) => <option key={k} value={k}>{statusText(k)}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{ts('empty.adjustments')}</td></tr>}
            {rows.map((d) => (
              <tr key={d.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{d.docNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{d.docDate}</td>
                <td className={`${CELL} text-center`}>{d.warehouse?.name || '—'}</td>
                <td className={`${CELL} text-center`}>{d.reference || '—'}</td>
                <td className={`${CELL} text-center`}>{d.reason || '—'}</td>
                <td className={`${CELL} text-center`}>{d.lineCount ?? 0}</td>
                <td className={`${CELL} text-center`}>{d.creator?.fullName}</td>
                <td className={`${CELL} text-center`}><Tag>{statusText(d.status)}</Tag></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions d={d} showView onChanged={list.reload} onError={onError} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </>
  );
}

export default function StockList() {
  const { t } = useTranslation('stock');
  const { can } = useAuth();
  const location = useLocation();
  const canLevels = can('stock.read'); const canAdj = can('adjustments.read');
  const [tab, setTab] = useState(location.state?.tab || (canLevels ? 'levels' : 'adjustments'));
  const [err, setErr] = useState('');
  const canAll = can('warehouses.read_all');
  const [warehouseId, setWarehouseId] = useState('');
  const whs = useLoad(() => warehouseApi.options(), []);
  const warehouses = whs.data || [];
  // A user with one warehouse only: start on it (there is no "all" for them).
  useEffect(() => { if (!canAll && warehouses.length === 1 && !warehouseId) setWarehouseId(warehouses[0].id); }, [whs.data]); // eslint-disable-line
  const whControl = <WarehouseSelect warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} canAll={canAll} />;
  const tabBtn = (key, label) => (
    <button type="button" onClick={() => { setErr(''); setTab(key); }}
      className={`border-b-2 px-4 py-2 text-[14px] text-[#212121] ${tab === key ? 'border-black font-semibold' : 'border-transparent hover:border-black/30'}`}>{label}</button>
  );
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
        </div>
        {can('adjustments.create') && <Link to="/stock/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('newAdjustment')}</Link>}
      </div>
      <div className="px-4"><Banner kind="ok">{location.state?.msg}</Banner></div>
      <div className="mb-4 flex gap-1 border-b border-line px-4">
        {canLevels && tabBtn('levels', t('tabs.levels'))}
        {canAdj && tabBtn('adjustments', t('tabs.adjustments'))}
      </div>
      {tab === 'levels' && canLevels
        ? <LevelsTable onError={setErr} warehouseId={warehouseId} warehouses={warehouses} whControl={whControl} />
        : <AdjustmentsTable onError={setErr} err={err} warehouseId={warehouseId} whControl={whControl} />}
    </div>
  );
}

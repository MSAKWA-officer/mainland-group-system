import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { itemApi, movementApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, FileTextIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { currentLocale } from '../../utils/locale';
import { IconBtn, Tag, qty } from '../stock/StockList.jsx';

// Movement type codes. The visible names live in i18n/locales/<lang>/movements.json under "types".
export const TYPES = ['RECEIVING', 'ADJUSTMENT', 'REJECT_IN', 'REJECT_OUT', 'EXPIRED', 'DAMAGED'];
export const money = (v) => (v === undefined || v === null || v === '' ? '—' : Number(v).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// Translated labels for a movement type and direction. Unknown codes are shown as they come from the API.
export function useMovementText() {
  const { t } = useTranslation('movements');
  return {
    type: (k) => t(`types.${k}`, { defaultValue: k }),
    direction: (k) => t(`direction.${k}`, { defaultValue: k }),
  };
}

// Where the source document of a movement can be opened. Add the other document types here as their pages are built.
export function docPath(m, can) {
  if (!m.document) return null;
  if (m.movementType === 'RECEIVING' && can('receiving.read')) return `/receiving/${m.document.id}`;
  if (m.movementType === 'ADJUSTMENT' && can('adjustments.read')) return `/adjustments/${m.document.id}`;
  if (m.movementType === 'REJECT_IN' && can('reject_in.read')) return `/reject-in/${m.document.id}`;
  if (m.movementType === 'REJECT_OUT' && can('reject_out.read')) return `/reject-out/${m.document.id}`;
  if (m.movementType === 'EXPIRED' && can('expired.read')) return `/expired/${m.document.id}`;
  if (m.movementType === 'DAMAGED' && can('damaged.read')) return `/damaged/${m.document.id}`;
  return null;
}

// Icon actions. Movements are a permanent ledger, so there is no edit or delete: only View and Open document.
export function RowActions({ m, showView }) {
  const { t } = useTranslation('movements');
  const { can } = useAuth();
  const navigate = useNavigate();
  const path = docPath(m, can);
  return (
    <div className="flex items-center gap-1">
      {showView && <IconBtn label={t('actions.view')} onClick={() => navigate(`/movements/${m.id}`)}><EyeIcon /></IconBtn>}
      {path && <IconBtn label={t('actions.openDocument')} onClick={() => navigate(path)}><FileTextIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function MovementsList() {
  const { t } = useTranslation('movements');
  const text = useMovementText();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ itemId: params.get('itemId') || '', movementType: '', direction: '', from: '', to: '' });
  const items = useLoad(() => itemApi.list({ limit: 100 }), []);
  const list = useLoad(() => movementApi.list({ page, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, f]);
  const rows = list.data?.data || [];
  const showCost = can('items.view_cost');
  const heads = ['date', 'type', 'document', 'item', 'batch', 'direction', 'quantity', 'balanceAfter', ...(showCost ? ['unitCost'] : []), 'by', 'actions'].map((k) => t(`heads.${k}`));
  const set = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('recorded', { count: list.data ? list.data.total : 0 })}</p>
      </div>
      <div className="px-4">
        <Banner>{list.error}</Banner>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <select className="input max-w-xs !text-[14px] !text-[#212121]" value={f.itemId} onChange={set('itemId')}>
            <option value="">{t('filters.allItems')}</option>
            {(items.data?.data || []).map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
          </select>
          <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" value={f.movementType} onChange={set('movementType')}>
            <option value="">{t('filters.allTypes')}</option>
            {TYPES.map((k) => <option key={k} value={k}>{text.type(k)}</option>)}
          </select>
          <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" value={f.direction} onChange={set('direction')}>
            <option value="">{t('filters.allDirections')}</option><option value="IN">{text.direction('IN')}</option><option value="OUT">{text.direction('OUT')}</option>
          </select>
          <label className="text-[14px]">{t('filters.from')} <input className="input ml-1 inline-block w-auto !text-[14px] !text-[#212121]" type="date" value={f.from} onChange={set('from')} /></label>
          <label className="text-[14px]">{t('filters.to')} <input className="input ml-1 inline-block w-auto !text-[14px] !text-[#212121]" type="date" value={f.to} onChange={set('to')} /></label>
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{t('empty')}</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{fmt(m.occurredAt)}</td>
                <td className={`${CELL} text-center`}><Tag>{text.type(m.movementType)}</Tag></td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{m.document?.docNo || '—'}</td>
                <td className={`${CELL} text-center`}><div>{m.item?.name}</div><div className="text-xs">{m.item?.sku}</div></td>
                <td className={`${CELL} text-center`}>{m.batch?.batchNo || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{text.direction(m.direction)}</td>
                <td className={`${CELL} text-center`}>{qty(m.quantity)} {m.item?.unit}</td>
                <td className={`${CELL} text-center`}>{qty(m.balanceAfter)}</td>
                {showCost && <td className={`${CELL} text-center`}>{money(m.unitCost)}</td>}
                <td className={`${CELL} text-center`}>{m.performer?.fullName}</td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions m={m} showView /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

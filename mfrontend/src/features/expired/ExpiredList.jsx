import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { expiredApi, stockApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { IconBtn, qty } from '../stock/StockList.jsx';

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
export const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
export const HEAD = `${CELL} bg-white font-semibold uppercase`;
export const al = (i) => (i === 0 ? 'text-left' : 'text-center');
export const TONE = { expired: 'font-semibold text-red-600', soon: 'font-semibold text-amber-600', valid: 'text-[#212121]' };
const LIMIT = 20;

export const useBatchText = () => {
  const { t } = useTranslation('expired');
  return {
    t,
    status: (s) => t(`batches.${s}`, { defaultValue: { expired: 'Expired', soon: 'Expiring soon', valid: 'Valid' }[s] || s }),
  };
};

// View + delete icons for one batch. Used by this list and by ExpiredView.
// Delete = write off the batch's remaining quantity as expired stock. It is only offered once the batch has expired,
// because stock never changes without a document (the write-off is saved, posted and kept in the audit trail).
export function BatchActions({ b, showView, onChanged, onError, afterDelete }) {
  const { t } = useBatchText();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canDelete = can('expired.create') && b.status === 'expired' && Number(b.quantity) > 0;
  const remove = async () => {
    const name = `${b.item?.name} / ${b.batchNo}`;
    if (!window.confirm(t('batches.confirmDelete', { name, qty: qty(b.quantity), defaultValue: `Delete expired stock ${name}? The remaining ${qty(b.quantity)} will be removed from stock.` }))) return;
    onError('');
    try {
      const d = await expiredApi.create({ docDate: new Date().toISOString().slice(0, 10), reference: null, reason: null,
        lines: [{ itemId: b.itemId, batchId: b.id, quantity: Number(b.quantity), remarks: null }] });
      (afterDelete || onChanged)?.(d);
    } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center justify-center gap-1">
      {showView && <IconBtn label={t('actions.view', { ns: 'docs', defaultValue: 'View' })} onClick={() => navigate(`/expired/${b.id}`)}><EyeIcon /></IconBtn>}
      {canDelete && <IconBtn label={t('actions.delete', { ns: 'docs', defaultValue: 'Delete' })} danger onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

export default function ExpiredList() {
  const { t, status: statusText } = useBatchText();
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const list = useLoad(() => stockApi.expiryBatches(), []);
  const q = search.trim().toLowerCase();
  const all = (Array.isArray(list.data) ? list.data : []).filter((b) =>
    (!status || b.status === status) &&
    (!q || [b.batchNo, b.item?.name, b.item?.sku, b.dateReceived, b.expiryDate].some((v) => String(v || '').toLowerCase().includes(q))));
  const rows = all.slice((page - 1) * LIMIT, page * LIMIT);
  const heads = ['batchNo', 'item', 'dateReceived', 'quantity', 'expiryDate', 'status', 'actions'];
  const dflt = { batchNo: 'Batch no.', item: 'Item', dateReceived: 'Date received', quantity: 'Quantity in stock', expiryDate: 'Expiry date', status: 'Status', actions: 'Action' };
  const reset = (set) => (e) => { setPage(1); set(e.target.value); };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { count: list.data ? all.length : 0 })}</p>
        </div>
        {can('expired.create') && <Link to="/expired/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('newWriteOff')}</Link>}
      </div>
      <div className="px-4">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('batches.search', { defaultValue: 'Search batch, item or date' })} value={search} onChange={reset(setSearch)} />
          <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" value={status} onChange={reset(setStatus)}>
            <option value="">{t('allStatuses')}</option>
            {['valid', 'soon', 'expired'].map((k) => <option key={k} value={k}>{statusText(k)}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`batches.cols.${k}`, { defaultValue: dflt[k] })}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{t('batches.empty', { defaultValue: 'No received items with an expiry date yet.' })}</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{b.batchNo}</td>
                <td className={`${CELL} text-center`}>{b.item?.name}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{b.dateReceived}</td>
                <td className={`${CELL} text-center`}>{qty(b.quantity)} {b.item?.unit}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{b.expiryDate}</td>
                <td className={`${CELL} text-center ${TONE[b.status]}`}>{statusText(b.status)}</td>
                <td className={`${CELL} text-center`}><BatchActions b={b} showView onChanged={list.reload} onError={setErr}
                  afterDelete={(d) => { list.reload(); setErr(''); }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={all.length} limit={LIMIT} set={setPage} />}
    </div>
  );
}

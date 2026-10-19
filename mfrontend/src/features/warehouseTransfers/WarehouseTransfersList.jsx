import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warehouseTransferApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, CheckIcon, XIcon, BanIcon, UserCheckIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { IconBtn, Tag, qty } from '../stock/StockList.jsx';

// Approve / Reject (Manager, never on your own request), Cancel (the requester, while it waits), Confirm receipt (the salesperson of the receiving warehouse,
// once the Manager approved and the goods are IN_TRANSIT). Used by the list and by the view page.
export function RowActions({ d, showView, onChanged, onError }) {
  const { t } = useTranslation('warehouseTransfers');
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = d.createdBy === user.id; const waiting = d.status === 'SUBMITTED'; const inTransit = d.status === 'IN_TRANSIT';
  const run = async (action, body) => { onError(''); try { await warehouseTransferApi.act(d.id, action, body); onChanged?.(); } catch (x) { onError(errMsg(x)); } };
  return (
    <div className="flex items-center justify-center gap-1">
      {showView && <IconBtn label={t('actions.view')} onClick={() => navigate(`/warehouse-transfers/${d.id}`)}><EyeIcon /></IconBtn>}
      {waiting && !mine && can('warehouse_transfers.approve') && <IconBtn label={t('actions.approve')} onClick={() => { if (window.confirm(t('confirmApprove', { no: d.transferNo }))) run('approve'); }}><CheckIcon /></IconBtn>}
      {waiting && !mine && can('warehouse_transfers.approve') && <IconBtn label={t('actions.reject')} danger onClick={() => { const note = window.prompt(t('rejectPrompt')); if (note && note.trim()) run('reject', { note: note.trim() }); }}><XIcon /></IconBtn>}
      {inTransit && can('warehouse_transfers.receive') && <IconBtn label={t('actions.receive')} onClick={() => { if (window.confirm(t('confirmReceive', { no: d.transferNo }))) run('receive'); }}><UserCheckIcon /></IconBtn>}
      {waiting && mine && <IconBtn label={t('actions.cancel')} danger onClick={() => { if (window.confirm(t('confirmCancel', { no: d.transferNo }))) run('cancel'); }}><BanIcon /></IconBtn>}
    </div>
  );
}

const COLS = ['date', 'transferNo', 'from', 'to', 'items', 'createdBy', 'status', 'actions'];

export default function WarehouseTransfersList() {
  const { t } = useTranslation('warehouseTransfers');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [input, setInput] = useState(''); const [search, setSearch] = useState('');
  const [status, setStatus] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { const h = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [input]);
  const list = useLoad(() => warehouseTransferApi.list({ page, ...(search && { search }), ...(status && { status }) }), [page, search, status]);
  const rows = list.data?.data || [];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div><h1 className="text-[18px] font-bold">{t('title')}</h1><p className="mt-0.5">{t('registered', { total: list.data ? list.data.total : 0 })}</p></div>
        {can('warehouse_transfers.create') && <Link to="/warehouse-transfers/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('new')}</Link>}
      </div>
      <div className="px-4 [&>div]:!text-black">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner>
        <div className="mb-4 flex flex-wrap gap-3">
          <input type="search" className="input max-w-sm !text-[14px]" placeholder={t('search')} value={input} onChange={(e) => setInput(e.target.value)} />
          <select className="input max-w-[12rem] !text-[14px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">{t('allStatuses')}</option>
            {['SUBMITTED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((c, i) => <th key={c} className={`${HEAD} ${al(i)}`}>{t(`cols.${c}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{t('empty')}</td></tr>}
            {rows.map((d) => (
              <tr key={d.id}>
                <td className={`${CELL} text-left whitespace-nowrap`}>{d.transferDate}</td>
                <td className={`${CELL} text-center`}>{d.transferNo}</td>
                <td className={`${CELL} text-center`}>{d.fromWarehouse?.name}</td>
                <td className={`${CELL} text-center`}>{d.toWarehouse?.name}</td>
                <td className={`${CELL} text-center`}>{d.lines.map((l) => `${l.item?.name} ${qty(l.quantity)} ${l.item?.unit || ''}`.trim()).join(', ')}</td>
                <td className={`${CELL} text-center`}>{d.creator?.fullName || '—'}</td>
                <td className={`${CELL} text-center`}><Tag>{t(`status.${d.status}`)}</Tag></td>
                <td className={`${CELL} text-center`}><RowActions d={d} showView onChanged={list.reload} onError={setErr} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

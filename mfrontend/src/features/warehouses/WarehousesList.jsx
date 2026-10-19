import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { warehouseApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, PencilIcon, PowerIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { IconBtn, qty } from '../stock/StockList.jsx';

export const Status = ({ active }) => {
  const { t } = useTranslation('warehouses');
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-600' : 'bg-slate-400'}`} />{active ? t('status.ACTIVE') : t('status.INACTIVE')}
    </span>
  );
};

// View / Edit / Activate-Deactivate. Used by the list and by WarehousesView.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('warehouses');
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
    try { await warehouseApi.setStatus(r.id, body); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center justify-center gap-1">
      {showView && <IconBtn label={t('actions.view')} onClick={() => navigate(`/warehouses/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('warehouses.update') && <IconBtn label={t('actions.edit')} onClick={() => navigate(`/warehouses/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('warehouses.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} danger={r.isActive} onClick={toggle}><PowerIcon /></IconBtn>}
    </div>
  );
}

const COLS = ['code', 'name', 'location', 'storekeepers', 'items', 'units', 'status', 'actions'];

export default function WarehousesList() {
  const { t } = useTranslation('warehouses');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [input, setInput] = useState(''); const [search, setSearch] = useState('');
  const [status, setStatus] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { const h = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [input]);
  const list = useLoad(() => warehouseApi.list({ page, ...(search && { search }), ...(status && { isActive: status }) }), [page, search, status]);
  const rows = list.data?.data || [];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5">{t('registered', { total: list.data ? list.data.total : 0 })}</p>
        </div>
        {can('warehouses.create') && <Link to="/warehouses/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('new')}</Link>}
      </div>
      <div className="px-4 [&>div]:!text-black">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner>
        <div className="mb-4 flex flex-wrap gap-3">
          <input type="search" className="input max-w-sm !text-[14px]" placeholder={t('search')} value={input} onChange={(e) => setInput(e.target.value)} />
          <select className="input max-w-[12rem] !text-[14px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">{t('allStatuses')}</option><option value="true">{t('status.ACTIVE')}</option><option value="false">{t('status.INACTIVE')}</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((c, i) => <th key={c} className={`${HEAD} ${al(i)}`}>{t(`cols.${c}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{t('empty')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${CELL} text-left`}>{r.code}{r.isDefault && <span className="ml-2 rounded border border-black/30 px-1.5 text-xs">{t('default')}</span>}</td>
                <td className={`${CELL} text-center`}>{r.name}</td>
                <td className={`${CELL} text-center`}>{r.location || '—'}</td>
                <td className={`${CELL} text-center`}>{r.storekeepers.length ? r.storekeepers.map((k) => k.fullName).join(', ') : '—'}</td>
                <td className={`${CELL} text-center`}>{r.itemCount}</td>
                <td className={`${CELL} text-center`}>{qty(r.totalUnits)}</td>
                <td className={`${CELL} text-center`}><Status active={r.isActive} /></td>
                <td className={`${CELL} text-center`}><RowActions r={r} showView onChanged={list.reload} onError={setErr} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

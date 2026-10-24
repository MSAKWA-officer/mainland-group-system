import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { physicalCountApi, warehouseApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, BanIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { IconBtn, Tag, qty } from '../stock/StockList.jsx';

const COLS = ['date', 'countNo', 'warehouse', 'itemsCounted', 'itemsWithDifference', 'totalDifference', 'createdBy', 'status', 'actions'];

// Sign is shown so a shortage (-) and a surplus (+) are obvious at a glance.
export const diff = (v) => { const n = Number(v || 0); return n > 0 ? `+${qty(n)}` : qty(n); };

export default function PhysicalCountsList() {
  const { t } = useTranslation('physicalCounts');
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [input, setInput] = useState(''); const [search, setSearch] = useState('');
  const [status, setStatus] = useState(''); const [warehouseId, setWarehouseId] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { const h = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [input]);
  const whs = useLoad(() => warehouseApi.options(), []);
  const list = useLoad(() => physicalCountApi.list({ page, ...(search && { search }), ...(status && { status }), ...(warehouseId && { warehouseId }) }), [page, search, status, warehouseId]);
  const rows = list.data?.data || [];
  const voidIt = async (d) => {
    const reason = window.prompt(t('voidPrompt', { no: d.countNo }));
    if (!reason || reason.trim().length < 3) return;
    setErr('');
    try { await physicalCountApi.voidCount(d.id, reason.trim()); list.reload(); } catch (x) { setErr(errMsg(x)); }
  };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div><h1 className="text-[18px] font-bold">{t('title')}</h1><p className="mt-0.5">{t('registered', { total: list.data ? list.data.total : 0 })}</p></div>
        {can('physical_counts.create') && <Link to="/physical-counts/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('new')}</Link>}
      </div>
      <div className="px-4 [&>div]:!text-black">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner>
        <div className="mb-4 flex flex-wrap gap-3">
          <input type="search" className="input max-w-sm !text-[14px]" placeholder={t('search')} value={input} onChange={(e) => setInput(e.target.value)} />
          <select className="input max-w-[16rem] !text-[14px]" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}>
            <option value="">{t('allWarehouses')}</option>
            {(whs.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
          <select className="input max-w-[12rem] !text-[14px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">{t('allStatuses')}</option>
            {['POSTED', 'VOID'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
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
                <td className={`${CELL} text-left whitespace-nowrap`}>{d.countDate}</td>
                <td className={`${CELL} text-center`}>{d.countNo}</td>
                <td className={`${CELL} text-center`}>{d.warehouse?.name}</td>
                <td className={`${CELL} text-center`}>{d.itemsCounted}</td>
                <td className={`${CELL} text-center`}>{d.itemsWithDifference}</td>
                <td className={`${CELL} text-center`}>{diff(d.totalDifference)}</td>
                <td className={`${CELL} text-center`}>{d.creator?.fullName || '—'}</td>
                <td className={`${CELL} text-center`}><Tag>{t(`status.${d.status}`)}</Tag></td>
                <td className={`${CELL} text-center`}>
                  <div className="flex items-center justify-center gap-1">
                    <IconBtn label={t('actions.view')} onClick={() => navigate(`/physical-counts/${d.id}`)}><EyeIcon /></IconBtn>
                    {d.status === 'POSTED' && can('physical_counts.void') && <IconBtn label={t('actions.void')} danger onClick={() => voidIt(d)}><BanIcon /></IconBtn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

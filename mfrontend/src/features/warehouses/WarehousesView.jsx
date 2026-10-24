import { Fragment, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warehouseApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { qty } from '../stock/StockList.jsx';
import { RowActions, Status } from './WarehousesList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]"><dt className="font-medium">{label}</dt><dd>{children || '—'}</dd></div>
);

function StockTab({ id }) {
  const { t } = useTranslation('warehouses');
  const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const q = useLoad(() => warehouseApi.stock(id, { page, ...(search && { search }) }), [id, page, search]);
  const heads = ['item', 'category', 'batch', 'quantity', 'expiry'];   // batch, quantity and expiry each have their own column
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <input type="search" className="input mb-3 max-w-sm" placeholder={t('view.searchItems')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      <Banner>{q.error}</Banner>
      <div className="overflow-x-auto"><table className="w-full border-collapse bg-white">
        <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`stockCols.${h}`)}</th>)}</tr></thead>
        <tbody>
          {q.data && q.data.data.length === 0 && <tr><td className={CELL} colSpan={heads.length}>{t('view.noStock')}</td></tr>}
          {(q.data?.data || []).map((r) => {
            // One row per batch (an item without batches has a single row). Item and category are written once and span all its rows.
            const rows = r.batches.length ? r.batches : [null];
            return (
              <Fragment key={r.itemId}>
                {rows.map((b, n) => (
                  <tr key={b ? b.id : 'all'}>
                    {n === 0 && (
                      <>
                        <td rowSpan={rows.length} className={`${CELL} text-left`}>
                          <div>{r.item.name}</div><div className="text-xs">{r.item.sku}</div>
                          {rows.length > 1 && <div className="mt-1 text-xs">{t('stockCols.total')}: <b>{qty(r.quantity)} {r.item.unit}</b></div>}
                        </td>
                        <td rowSpan={rows.length} className={`${CELL} text-center`}>{r.item.category?.name || '—'}</td>
                      </>
                    )}
                    <td className={`${CELL} text-center`}>{b ? b.batchNo : '—'}</td>
                    <td className={`${CELL} text-center`}>{qty(b ? b.quantity : r.quantity)} {r.item.unit}</td>
                    <td className={`${CELL} text-center ${b && b.expiryDate < today ? 'text-red-600' : ''}`}>
                      {b ? <>{b.expiryDate}{b.expiryDate < today && <span className="ml-1 text-xs">({t('stockCols.expired')})</span>}</> : '—'}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table></div>
      {q.data && <Pager page={page} total={q.data.total} limit={q.data.limit} set={setPage} />}
    </div>
  );
}

function MovementsTab({ id }) {
  const { t } = useTranslation('warehouses');
  const [page, setPage] = useState(1);
  const q = useLoad(() => warehouseApi.movements(id, { page }), [id, page]);
  const heads = ['date', 'type', 'item', 'batch', 'in', 'out', 'balance', 'by'];
  return (
    <div>
      <Banner>{q.error}</Banner>
      <div className="overflow-x-auto"><table className="w-full border-collapse bg-white">
        <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`moveCols.${h}`)}</th>)}</tr></thead>
        <tbody>
          {q.data && q.data.data.length === 0 && <tr><td className={CELL} colSpan={heads.length}>{t('view.noMovements')}</td></tr>}
          {(q.data?.data || []).map((m) => (
            <tr key={m.id}>
              <td className={`${CELL} text-left whitespace-nowrap`}>{fmt(m.occurredAt)}</td>
              <td className={`${CELL} text-center`}>{t(`moveTypes.${m.movementType}`, { defaultValue: m.movementType })}</td>
              <td className={`${CELL} text-center`}>{m.itemName}</td>
              <td className={`${CELL} text-center`}>{m.batchNo || '—'}</td>
              <td className={`${CELL} text-center`}>{m.direction === 'IN' ? qty(m.quantity) : ''}</td>
              <td className={`${CELL} text-center`}>{m.direction === 'OUT' ? qty(m.quantity) : ''}</td>
              <td className={`${CELL} text-center`}>{qty(m.balanceAfter)}</td>
              <td className={`${CELL} text-center`}>{m.performedBy || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {q.data && <Pager page={page} total={q.data.total} limit={q.data.limit} set={setPage} />}
    </div>
  );
}

export default function WarehousesView() {
  const { t } = useTranslation('warehouses');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [tab, setTab] = useState('stock');
  const q = useLoad(() => warehouseApi.get(id), [id]);
  const w = q.data;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-[18px] font-bold">{w ? `${w.code} · ${w.name}` : t('title')}</h1>
          {!w && <p className="mt-1">{tc('loading')}</p>}
        </div>
        <Link to="/warehouses" className="inline-flex items-center gap-2 hover:underline"><ArrowLeftIcon />{t('form.back')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && <div className="px-6 [&>div]:!text-black"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {w && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.location')}>{w.location}</Row>
            <Row label={t('view.description')}>{w.description}</Row>
            <Row label={t('view.storekeepers')}>{w.storekeepers.map((k) => k.fullName).join(', ')}</Row>
            <Row label={t('view.salespersons')}>{w.salespersons.map((s) => s.fullName).join(', ')}</Row>
            <Row label={t('view.totals')}>{`${w.itemCount} ${t('view.items')} · ${qty(w.totalUnits)} ${t('view.units')}`}</Row>
            <Row label={t('view.status')}><Status active={w.isActive} />{w.isDefault && ` · ${t('default')}`}</Row>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RowActions r={w} onChanged={q.reload} onError={setErr} />
            {can('warehouse_transfers.create') && w.isActive && <Link to={`/warehouse-transfers/new?from=${w.id}`} className="btn-ghost">{t('view.transferOut')}</Link>}
          </div>
          <div className="mt-6 flex gap-2 border-b border-line">
            {['stock', 'movements'].map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 font-semibold ${tab === k ? 'border-b-2 border-black' : 'opacity-60'}`}>{t(`view.tabs.${k}`)}</button>
            ))}
          </div>
          <div className="mt-4">{tab === 'stock' ? <StockTab id={id} /> : <MovementsTab id={id} />}</div>
        </div>
      )}
    </div>
  );
}

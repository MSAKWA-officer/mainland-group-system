import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { categoryApi, reportApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import useLoad from '../../utils/useLoad';
import { Tag } from '../stock/StockList.jsx';
import { useMovementText } from '../movements/MovementsList.jsx';
import { REPORTS, money, num } from './ReportsList.jsx';

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

function DataTable({ cols, rows, empty }) {
  const { t } = useTranslation('reports');
  return (
    <div className="overflow-x-auto px-4">
      <table className="w-full border-collapse bg-white">
        <thead><tr>{cols.map(([h], i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={cols.length}>{empty || t('view.noData')}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.itemId || r.batchId || r.categoryId || i} className="bg-white">
              {cols.map(([h, fn], j) => <td key={h} className={`${CELL} ${al(j)}`}>{fn(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Cost columns are added only when the API returned them (stock_reports.valuation).
const withCost = (rows, extra) => (rows.some((r) => r.stockValue !== undefined || r.value !== undefined) ? extra : []);


export default function ReportsView() {
  const { t } = useTranslation('reports');
  const tm = useMovementText();
  const c = (k) => t(`cols.${k}`);   // column title
  const itemCols = [[c('sku'), (r) => r.sku], [c('item'), (r) => r.name]];
  const { type } = useParams();
  const { can } = useAuth();
  const def = REPORTS[type];
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: '', categoryId: '', includeZero: false, days: 30, includeExpired: true, from: '', to: '', groupBy: 'type' });
  const cats = useLoad(() => categoryApi.list({ limit: 500 }), []);
  const q = useLoad(() => {
    const p = { page };
    if (type === 'stock-on-hand') return reportApi.stockOnHand({ ...p, search: f.search || undefined, categoryId: f.categoryId || undefined, includeZero: f.includeZero });
    if (type === 'low-stock') return reportApi.lowStock(p);
    if (type === 'expiry') return reportApi.expiry({ ...p, days: f.days, includeExpired: f.includeExpired });
    if (type === 'movements') return reportApi.movements({ ...p, groupBy: f.groupBy, from: f.from || undefined, to: f.to || undefined });
    if (type === 'write-offs') return reportApi.writeOffs({ from: f.from || undefined, to: f.to || undefined });
    if (type === 'valuation') return reportApi.valuation();
    return Promise.resolve(null);
  }, [type, page, JSON.stringify(f)]);
  if (!def || (def.valuation && !can('stock_reports.valuation'))) return <Navigate to="/reports" replace />;

  const set = (k, v) => { setPage(1); setF({ ...f, [k]: v }); };
  const d = q.data;
  const rows = d?.data || [];
  const dateFilters = (
    <>
      <label className="text-[14px]">{t('view.from')} <input className="input ml-1 inline-block w-auto !text-[14px] !text-[#212121]" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
      <label className="text-[14px]">{t('view.to')} <input className="input ml-1 inline-block w-auto !text-[14px] !text-[#212121]" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
      <span className="text-[14px]">{t('view.leaveEmpty')}</span>
    </>
  );

  let filters = null; let body = null;
  if (type === 'stock-on-hand') {
    filters = (
      <>
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('view.searchPlaceholder')} value={f.search} onChange={(e) => set('search', e.target.value)} />
        <select className="input max-w-xs !text-[14px] !text-[#212121]" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">{t('view.allCategories')}</option>
          {(cats.data?.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.includeZero} onChange={(e) => set('includeZero', e.target.checked)} /> {t('view.includeZero')}</label>
      </>
    );
    body = <DataTable rows={rows} cols={[...itemCols, [c('category'), (r) => r.category], [c('unit'), (r) => r.unit], [c('quantity'), (r) => num(r.quantity)], [c('reorderLevel'), (r) => num(r.reorderLevel)],
      [c('sellingPrice'), (r) => money(r.sellingPrice)], ...withCost(rows, [[c('costPrice'), (r) => money(r.costPrice)], [c('stockValue'), (r) => money(r.stockValue)]])]} />;
  } else if (type === 'low-stock') {
    body = <DataTable rows={rows} empty={t('view.emptyLow')} cols={[...itemCols, [c('category'), (r) => r.category], [c('unit'), (r) => r.unit], [c('quantity'), (r) => num(r.quantity)], [c('reorderLevel'), (r) => num(r.reorderLevel)], [c('shortfall'), (r) => num(r.shortfall)]]} />;
  } else if (type === 'expiry') {
    filters = (
      <>
        <label className="text-[14px]">{t('view.expiringWithin')} <input className="input mx-1 inline-block w-20 !text-[14px] !text-[#212121]" type="number" min="0" max="365" value={f.days} onChange={(e) => set('days', Math.min(365, Math.max(0, Number(e.target.value) || 0)))} /> {t('view.daysSuffix')}</label>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.includeExpired} onChange={(e) => set('includeExpired', e.target.checked)} /> {t('view.includeExpired')}</label>
      </>
    );
    body = <DataTable rows={rows} empty={t('view.emptyExpiry')} cols={[...itemCols, [c('batch'), (r) => r.batchNo], [c('expiryDate'), (r) => r.expiryDate], [c('quantity'), (r) => `${num(r.quantity)} ${r.unit}`],
      [c('daysLeft'), (r) => num(r.daysLeft, 0)], [c('status'), (r) => <Tag>{t(`expiryStatus.${r.status === 'EXPIRED' ? 'EXPIRED' : 'EXPIRING'}`)}</Tag>], ...withCost(rows, [[c('stockValue'), (r) => money(r.stockValue)]])]} />;
  } else if (type === 'movements') {
    filters = (
      <>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" value={f.groupBy} onChange={(e) => set('groupBy', e.target.value)}>
          <option value="type">{t('view.groupByType')}</option><option value="item">{t('view.groupByItem')}</option>
        </select>
        {dateFilters}
      </>
    );
    body = f.groupBy === 'item'
      ? <DataTable rows={rows} cols={[...itemCols, [c('unit'), (r) => r.unit], [c('qtyIn'), (r) => num(r.qtyIn)], [c('qtyOut'), (r) => num(r.qtyOut)], [c('balance'), (r) => num(r.balance)]]} />
      : <DataTable rows={rows} cols={[[c('type'), (r) => tm.type(r.movementType)], [c('direction'), (r) => tm.direction(r.direction)], [c('movements'), (r) => num(r.movements, 0)], [c('quantity'), (r) => num(r.quantity)],
        ...withCost(rows, [[c('value'), (r) => money(r.value)]])]} />;
  } else if (type === 'write-offs') {
    filters = dateFilters;
    const byType = d?.byType || []; const top = d?.topItems || [];
    body = (
      <div className="space-y-6">
        <div><h2 className="px-4 pb-2 text-[14px] font-bold">{t('view.byType')}</h2>
          <DataTable rows={byType} cols={[[c('type'), (r) => tm.type(r.movementType)], [c('movements'), (r) => num(r.movements, 0)], [c('quantity'), (r) => num(r.quantity)], ...withCost(byType, [[c('value'), (r) => money(r.value)]])]} /></div>
        <div><h2 className="px-4 pb-2 text-[14px] font-bold">{t('view.topLost')}</h2>
          <DataTable rows={top} cols={[...itemCols, [c('quantity'), (r) => `${num(r.quantity)} ${r.unit}`], ...withCost(top, [[c('value'), (r) => money(r.value)]])]} /></div>
      </div>
    );
  } else if (type === 'valuation') {
    body = (
      <>
        <DataTable rows={rows} cols={[[c('category'), (r) => r.category], [c('items'), (r) => num(r.items, 0)], [c('quantity'), (r) => num(r.quantity)], [c('valueAtCost'), (r) => money(r.value)]]} />
        {d && <p className="px-4 py-3 text-[14px] font-semibold">{t('view.totalValue', { value: money(d.totalValue) })}</p>}
      </>
    );
  }

  const paged = d && d.total !== undefined && !(type === 'movements' && f.groupBy === 'type');
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t(`defs.${type}.title`)}</h1>
          <p className="mt-0.5 text-[14px]">{t(`defs.${type}.desc`)}</p>
        </div>
        <Link to="/reports" className="text-[14px] hover:underline">{t('view.backToReports')}</Link>
      </div>
      <div className="px-4">
        <Banner>{q.error}</Banner>
        {filters && <div className="mb-4 flex flex-wrap items-center gap-3">{filters}</div>}
      </div>
      {q.loading && !d ? <p className="px-4 pb-4 text-[14px]">{t('loading', { ns: 'common' })}</p> : body}
      {paged && <Pager page={page} total={d.total} limit={d.limit} set={setPage} />}
    </div>
  );
}

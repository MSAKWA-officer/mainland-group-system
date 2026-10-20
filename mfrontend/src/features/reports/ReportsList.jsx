import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { reportApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';
import { IconBtn } from '../stock/StockList.jsx';

export const num = (v, dp = 3) => (v === undefined || v === null || v === '' ? '—' : Number(v).toLocaleString(currentLocale(), { maximumFractionDigits: dp }));
export const money = (v) => (v === undefined || v === null || v === '' ? '—' : Number(v).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// The reports that exist. `valuation` means the report needs the stock_reports.valuation permission.
// The title and description of each report live in i18n/locales/<lang>/reports.json under "defs.<key>".
export const REPORTS = {
  'warehouse-statement': {},
  'stock-on-hand': {},
  'low-stock': {},
  expiry: {},
  movements: {},
  'write-offs': {},
  valuation: { valuation: true },
};

function Tile({ label, value }) {
  return (
    <div className="rounded-md border border-line p-4">
      <div className="text-xs uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function ReportsList() {
  const { t } = useTranslation('reports');
  const { t: ts } = useTranslation('warehouseStatement');   // title / description of the Warehouse Inventory Statement live in its own file
  const { can } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const sum = useLoad(() => reportApi.summary({ days }), [days]);
  const s = sum.data;
  const rows = Object.entries(REPORTS).filter(([, r]) => !r.valuation || can('stock_reports.valuation'));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <div className="px-4">
        <Banner>{sum.error}</Banner>
        <div className="mb-3 flex items-center gap-2 text-[14px]">
          <label htmlFor="days">{t('countWithin')}</label>
          <input id="days" className="input w-20 !text-[14px] !text-[#212121]" type="number" min="0" max="365" value={days}
            onChange={(e) => setDays(Math.min(365, Math.max(0, Number(e.target.value) || 0)))} />
          <span>{t('days')}</span>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={t('tiles.activeItems')} value={s ? num(s.activeItems, 0) : '…'} />
          <Tile label={t('tiles.totalUnits')} value={s ? num(s.totalUnits) : '…'} />
          <Tile label={t('tiles.outOfStock')} value={s ? num(s.outOfStock, 0) : '…'} />
          <Tile label={t('tiles.lowStock')} value={s ? num(s.lowStock, 0) : '…'} />
          <Tile label={t('tiles.expiredBatches')} value={s ? num(s.expiredBatches, 0) : '…'} />
          <Tile label={t('tiles.expiringWithin', { days })} value={s ? num(s.expiringSoon, 0) : '…'} />
          <Tile label={t('tiles.pendingApprovals')} value={s ? num(s.pendingApprovals, 0) : '…'} />
          {s && s.stockValue !== undefined && <Tile label={t('tiles.stockValue')} value={money(s.stockValue)} />}
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{['report', 'whatItShows', 'actions'].map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.${k}`)}</th>)}</tr></thead>
          <tbody>
            {rows.map(([key]) => (
              <tr key={key} className="bg-white">
                <td className={`${CELL} text-left`}>{key === 'warehouse-statement' ? ts('listTitle') : t(`defs.${key}.title`)}</td>
                <td className={`${CELL} text-center`}>{key === 'warehouse-statement' ? ts('listDesc') : t(`defs.${key}.desc`)}</td>
                <td className={`${CELL} text-center`}><div className="flex items-center justify-center gap-1"><IconBtn label={t('list.viewReport')} onClick={() => navigate(`/reports/${key}`)}><EyeIcon /></IconBtn></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { reportApi, warehouseApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { currentLocale } from '../../utils/locale';

// Local calendar date as YYYY-MM-DD.
const ymd = (d) => d.toLocaleDateString('en-CA');
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };
const n = (v) => (!v ? '-' : Number(v).toLocaleString(currentLocale(), { maximumFractionDigits: 3 }));

// Column colours follow the paper form. (Full class names, so Tailwind can see them.)
const BG = { text: 'bg-white', grey: 'bg-[#F2F2F2]', in: 'bg-[#EAF3E8]', out: 'bg-[#FDF2EC]', book: 'bg-[#EDEDED]', phys: 'bg-[#EAF0FA]' };
const COLS = [
  { key: 'code', g: 'text' }, { key: 'name', g: 'text' },
  { key: 'monthStart', g: 'grey' }, { key: 'periodStart', g: 'grey' },
  { key: 'factoryDelivery', g: 'in', group: 'inbound' }, { key: 'fromVehicle', g: 'in', group: 'inbound' },
  { key: 'salesReturn', g: 'in', group: 'inbound' }, { key: 'otherIn', g: 'in', group: 'inbound' },
  { key: 'toVehicle', g: 'out', group: 'outbound' }, { key: 'salesOut', g: 'out', group: 'outbound' },
  { key: 'damagedOut', g: 'out', group: 'outbound' }, { key: 'toFactory', g: 'out', group: 'outbound' }, { key: 'otherOut', g: 'out', group: 'outbound' },
  { key: 'bookBalance', g: 'book' }, { key: 'physical', g: 'phys' }, { key: 'variance', g: 'book' }, { key: 'remark', g: 'text' },
];
const CELL = 'border border-[#d1d5db] px-2 py-1.5 align-middle text-[13px] text-[#212121]';
const HEAD = 'border border-[#d1d5db] bg-[#5B8FC7] px-2 py-2 text-center text-[13px] font-semibold text-white';

export default function WarehouseStatement() {
  const { t } = useTranslation('warehouseStatement');
  const { can } = useAuth();
  const canAll = can('warehouses.read_all');
  const [warehouseId, setWarehouseId] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(ymd(new Date()));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const whs = useLoad(() => warehouseApi.options(), []);
  const warehouses = whs.data || [];
  // A user with a single warehouse starts on it (there is no "all" for them).
  useEffect(() => { if (!canAll && warehouses.length === 1 && !warehouseId) setWarehouseId(warehouses[0].id); }, [whs.data]); // eslint-disable-line

  const badRange = !from || !to || from > to;
  const list = useLoad(() => (badRange ? Promise.resolve(null) : reportApi.warehouseStatement({ warehouseId: warehouseId || undefined, from, to })), [warehouseId, from, to]);
  const s = list.data;
  const chosen = warehouses.find((w) => w.id === warehouseId);

  const download = async (format) => {
    setBusy(format); setErr('');
    try {
      const blob = await reportApi.downloadWarehouseStatement({ format, warehouseId: warehouseId || undefined, from, to });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `warehouse-inventory-statement_${chosen ? chosen.code : 'ALL'}_${from}_${to}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(''); }
  };

  const showAllNote = !warehouseId && (canAll || warehouses.length > 1);
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <Link to="/reports" className="text-[14px] hover:underline">{t('back')}</Link>
        <h1 className="mt-2 text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <div className="px-4">
        <Banner>{err || list.error}</Banner>
        {!canAll && !whs.loading && warehouses.length === 0 && <p className="mb-3">{t('noWarehouse')}</p>}
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">{t('filters.warehouse')}
            <select className="input min-w-[240px] !text-[14px] !text-[#212121]" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {(canAll || warehouses.length > 1) && <option value="">{canAll ? t('filters.all') : t('filters.allMine')}</option>}
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">{t('filters.from')}
            <input className="input !text-[14px] !text-[#212121]" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">{t('filters.to')}
            <input className="input !text-[14px] !text-[#212121]" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={badRange || !!busy || !s} onClick={() => download('xlsx')}>{busy === 'xlsx' ? t('buttons.preparing') : t('buttons.excel')}</button>
            <button type="button" className="btn-primary" disabled={badRange || !!busy || !s} onClick={() => download('pdf')}>{busy === 'pdf' ? t('buttons.preparing') : t('buttons.pdf')}</button>
          </div>
        </div>
        {badRange && <p className="mb-3 text-red-600">{t('invalidRange')}</p>}
        {showAllNote && <p className="mb-3 text-[13px]">{t('allNote')}</p>}
      </div>

      {s && (
        <div className="px-4 pb-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-[13px] font-semibold text-[#1F3F66]">
            <span>{t('period')}: {s.from} → {s.to}</span>
            <span>{t('warehouseLabel')}: {s.warehouse ? `${s.warehouse.code} — ${s.warehouse.name}` : t('allCombined')}</span>
            <span>{t('unit')}: {s.unit || t('unitMixed')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white">
              <thead>
                <tr>
                  {COLS.map((c, i) => {
                    if (c.group) {
                      if (COLS[i - 1]?.group === c.group) return null;
                      const span = COLS.filter((x) => x.group === c.group).length;
                      return <th key={c.group} colSpan={span} className={HEAD}>{t(`cols.${c.group}`)}</th>;
                    }
                    return <th key={c.key} rowSpan={2} className={`${HEAD} ${i < 2 ? 'text-left' : ''}`}>{t(`cols.${c.key}`)}</th>;
                  })}
                </tr>
                <tr>{COLS.filter((c) => c.group).map((c) => <th key={c.key} className={HEAD}>{t(`cols.${c.key}`)}</th>)}</tr>
              </thead>
              <tbody>
                {s.rows.length === 0 && <tr><td className={CELL} colSpan={COLS.length}>{t('empty')}</td></tr>}
                {s.rows.map((r) => (
                  <tr key={r.itemId}>
                    {COLS.map((c) => {
                      if (c.key === 'code' || c.key === 'name') return <td key={c.key} className={`${CELL} ${BG[c.g]} whitespace-nowrap`}>{r[c.key]}</td>;
                      if (['physical', 'variance', 'remark'].includes(c.key)) return <td key={c.key} className={`${CELL} ${BG[c.g]}`} />;
                      return <td key={c.key} className={`${CELL} ${BG[c.g]} text-right ${c.key === 'bookBalance' ? 'font-semibold' : ''}`}>{n(r[c.key])}</td>;
                    })}
                  </tr>
                ))}
                {s.rows.length > 0 && (
                  <tr className="bg-[#DDE7F3] font-semibold">
                    {COLS.map((c) => {
                      if (c.key === 'code') return <td key={c.key} className={CELL}>{t('total')}</td>;
                      if (['name', 'physical', 'variance', 'remark'].includes(c.key)) return <td key={c.key} className={CELL} />;
                      return <td key={c.key} className={`${CELL} text-right`}>{n(s.totals[c.key])}</td>;
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] text-[#595959]">
            <li>{t('notes.formula')}</li><li>{t('notes.physical')}</li><li>{t('notes.vehicle')}</li><li>{t('notes.other')}</li>
          </ul>
        </div>
      )}
      {list.loading && !s && <p className="px-4 pb-4">…</p>}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { physicalCountApi, warehouseApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { qty } from '../stock/StockList.jsx';
import { diff } from './PhysicalCountsList.jsx';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// The storekeeper picks the warehouse and the day of the count, then types what was counted next to every product.
// A product left empty is "not counted" (it is simply not saved). Recording a count never changes stock; the Warehouse Inventory Statement reads it.
export default function PhysicalCountsCreate() {
  const { t } = useTranslation('physicalCounts');
  const navigate = useNavigate();
  const whs = useLoad(() => warehouseApi.options(), []);
  const [head, setHead] = useState({ warehouseId: '', countDate: today(), note: '' });
  const [counted, setCounted] = useState({});      // itemId -> typed text
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { const m = whs.data; if (m && !head.warehouseId && m.length === 1) setHead((h) => ({ ...h, warehouseId: m[0].id })); }, [whs.data]); // eslint-disable-line

  const ready = !!head.warehouseId && !!head.countDate && head.countDate <= today();
  const sheet = useLoad(() => (ready ? physicalCountApi.sheet({ warehouseId: head.warehouseId, date: head.countDate }) : Promise.resolve(null)), [head.warehouseId, head.countDate]);
  const rows = sheet.data?.rows || [];
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.sku} ${r.name} ${r.category || ''}`.toLowerCase().includes(q)) : rows;
  }, [rows, filter]);
  const filled = rows.filter((r) => counted[r.itemId] !== undefined && counted[r.itemId] !== '');
  const set = (id, v) => setCounted((c) => ({ ...c, [id]: v }));
  const changeHead = (patch) => { setHead((h) => ({ ...h, ...patch })); setCounted({}); setErr(''); setFe({}); };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!filled.length) return setErr(t('form.nothingCounted'));
    if (filled.some((r) => !(Number(counted[r.itemId]) >= 0))) return setErr(t('form.badQty'));
    if (!window.confirm(t('form.confirm', { n: filled.length }))) return;
    setBusy(true);
    try {
      const d = await physicalCountApi.create({ warehouseId: head.warehouseId, countDate: head.countDate, note: head.note.trim() || null,
        lines: filled.map((r) => ({ itemId: r.itemId, countedQty: Number(counted[r.itemId]) })) });
      navigate(`/physical-counts/${d.id}`, { state: { msg: t('saved', { no: d.countNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };

  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div><h1 className="text-2xl font-semibold">{t('newTitle')}</h1><p className="mt-1 text-sm">{t('newSubtitle')}</p></div>
        <Link to="/physical-counts" className="text-sm hover:underline">{t('back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className="[&>div]:!text-black"><Banner>{err || whs.error || sheet.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label={t('form.warehouse')} error={fe.warehouseId}>
            <select className="input !text-black" required value={head.warehouseId} onChange={(e) => changeHead({ warehouseId: e.target.value })}>
              <option value="">{t('form.selectWarehouse')}</option>{(whs.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </Field>
          <Field label={t('form.date')} error={fe.countDate}>
            <input className="input !text-black" type="date" required max={today()} value={head.countDate} onChange={(e) => changeHead({ countDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2"><Field label={t('form.note')} error={fe.note}>
            <input className="input !text-black" maxLength={500} value={head.note} onChange={(e) => setHead({ ...head, note: e.target.value })} />
          </Field></div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold">{t('form.products')} ({filled.length} / {rows.length} {t('form.counted')})</h2>
            <input className="input max-w-xs !text-black" placeholder={t('form.search')} value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && ev.preventDefault()} disabled={!rows.length} />
          </div>
          <p className="text-xs">{t('form.hint')}</p>
          <div className="overflow-x-auto"><table className="w-full border-collapse bg-white">
            <thead><tr>{['code', 'name', 'unit', 'book', 'counted', 'difference'].map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`lineCols.${h}`)}</th>)}</tr></thead>
            <tbody>
              {!ready && <tr><td colSpan={6} className={`${CELL} text-left`}>{t('form.pickWarehouse')}</td></tr>}
              {ready && !sheet.loading && rows.length === 0 && <tr><td colSpan={6} className={`${CELL} text-left`}>{t('form.noProducts')}</td></tr>}
              {shown.map((r) => {
                const v = counted[r.itemId]; const has = v !== undefined && v !== '';
                return (
                  <tr key={r.itemId}>
                    <td className={`${CELL} text-left whitespace-nowrap`}>{r.sku}</td>
                    <td className={`${CELL} text-center`}>{r.name}</td>
                    <td className={`${CELL} text-center`}>{r.unit}</td>
                    <td className={`${CELL} text-center`}>{qty(r.bookQty)}</td>
                    <td className={`${CELL} text-center`}>
                      <input className="input !h-8 w-28 !text-center !text-black" type="number" min="0" step="0.001" inputMode="decimal" value={v ?? ''}
                        onChange={(e) => set(r.itemId, e.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && ev.preventDefault()} aria-label={`${r.sku} ${t('lineCols.counted')}`} />
                    </td>
                    <td className={`${CELL} text-center`}>{has ? diff(Number(v) - Number(r.bookQty)) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
        <button className="btn-primary" disabled={busy || !filled.length}>{busy ? t('form.saving') : t('form.submit')}</button>
      </form>
    </div>
  );
}

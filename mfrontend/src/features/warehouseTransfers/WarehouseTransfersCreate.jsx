import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warehouseApi, warehouseTransferApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { TrashIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { qty } from '../stock/StockList.jsx';

const emptyLine = () => ({ itemId: '', batchId: '', quantity: '', remarks: '' });
const today = () => new Date().toISOString().slice(0, 10);

// The storekeeper picks the source warehouse (one he is in charge of), the destination, and what to move.
// Nothing moves yet: a Manager must approve first.
export default function WarehouseTransfersCreate() {
  const { t } = useTranslation('warehouseTransfers');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const mineW = useLoad(() => warehouseApi.options(), []);
  const allW = useLoad(() => warehouseApi.options({ all: true }), []);
  const [head, setHead] = useState({ fromWarehouseId: sp.get('from') || '', toWarehouseId: '', transferDate: today(), reason: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { const m = mineW.data; if (m && !head.fromWarehouseId && m.length === 1) setHead((h) => ({ ...h, fromWarehouseId: m[0].id })); }, [mineW.data]); // eslint-disable-line
  const [search, setSearch] = useState('');
  const stock = useLoad(() => (head.fromWarehouseId ? warehouseApi.stock(head.fromWarehouseId, { limit: 100, ...(search && { search }) }) : Promise.resolve(null)), [head.fromWarehouseId, search]);
  const [known, setKnown] = useState({});
  useEffect(() => { if (stock.data) setKnown((k) => { const n = { ...k }; stock.data.data.forEach((r) => { n[r.itemId] = r; }); return n; }); }, [stock.data]);
  const options = Object.values(known).filter((r) => r.warehouseId === head.fromWarehouseId || r.item);
  const setLine = (i, p) => setLines(lines.map((l, n) => (n === i ? { ...l, ...p } : l)));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      const d = await warehouseTransferApi.create({ ...head, reason: head.reason.trim(),
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), ...(l.batchId && { batchId: l.batchId }), remarks: l.remarks.trim() || null })) });
      navigate('/warehouse-transfers', { state: { msg: t('requested', { no: d.transferNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  const fromChanged = (v) => { setHead({ ...head, fromWarehouseId: v }); setKnown({}); setLines([emptyLine()]); };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div><h1 className="text-2xl font-semibold">{t('newTitle')}</h1><p className="mt-1 text-sm">{t('newSubtitle')}</p></div>
        <Link to="/warehouse-transfers" className="text-sm hover:underline">{t('back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className="[&>div]:!text-black"><Banner>{err || mineW.error || allW.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label={t('form.from')} error={fe.fromWarehouseId}>
            <select className="input !text-black" required value={head.fromWarehouseId} onChange={(e) => fromChanged(e.target.value)}>
              <option value="">{t('form.selectWarehouse')}</option>{(mineW.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </Field>
          <Field label={t('form.to')} error={fe.toWarehouseId}>
            <select className="input !text-black" required value={head.toWarehouseId} onChange={(e) => setHead({ ...head, toWarehouseId: e.target.value })}>
              <option value="">{t('form.selectWarehouse')}</option>{(allW.data || []).filter((w) => w.id !== head.fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </Field>
          <Field label={t('form.date')} error={fe.transferDate}><input className="input !text-black" type="date" required value={head.transferDate} onChange={(e) => setHead({ ...head, transferDate: e.target.value })} /></Field>
          <Field label={t('form.reason')} error={fe.reason}><input className="input !text-black" required minLength={3} maxLength={1000} value={head.reason} onChange={(e) => setHead({ ...head, reason: e.target.value })} /></Field>
        </div>
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold">{t('form.items')}</h2>
            <input className="input max-w-xs !text-black" placeholder={t('form.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} disabled={!head.fromWarehouseId} />
          </div>
          {lines.map((l, i) => {
            const row = known[l.itemId]; const e = (k) => fe[`lines.${i}.${k}`];
            return (
              <div key={i} className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-4">
                <div className="sm:col-span-2"><Field label={t('form.item')} error={e('itemId')}>
                  <select className="input !text-black" required value={l.itemId} onChange={(ev) => setLine(i, { itemId: ev.target.value, batchId: '' })}>
                    <option value="">{t('form.selectItem')}</option>
                    {options.map((r) => <option key={r.itemId} value={r.itemId}>{r.item.sku} — {r.item.name} ({qty(r.quantity)} {r.item.unit})</option>)}
                  </select></Field></div>
                {row?.item.trackExpiry && (
                  <Field label={t('form.batch')} error={e('batchId')}>
                    <select className="input !text-black" required value={l.batchId} onChange={(ev) => setLine(i, { batchId: ev.target.value })}>
                      <option value="">{t('form.selectBatch')}</option>{row.batches.map((b) => <option key={b.id} value={b.id}>{b.batchNo} ({qty(b.quantity)}, {b.expiryDate})</option>)}
                    </select></Field>
                )}
                <Field label={row ? t('form.quantityUnit', { unit: row.item.unit }) : t('form.quantity')} error={e('quantity')}>
                  <input className="input !text-black" type="number" required min="0.001" step="0.001" value={l.quantity} onChange={(ev) => setLine(i, { quantity: ev.target.value })} /></Field>
                <div className="sm:col-span-3"><Field label={t('form.remarks')} error={e('remarks')}><input className="input !text-black" maxLength={255} value={l.remarks} onChange={(ev) => setLine(i, { remarks: ev.target.value })} /></Field></div>
                <div className="flex items-end justify-end">
                  {lines.length > 1 && <button type="button" aria-label={t('form.removeLine')} title={t('form.removeLine')} onClick={() => setLines(lines.filter((_, n) => n !== i))} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-slate-100"><TrashIcon /></button>}
                </div>
              </div>
            );
          })}
          <button type="button" className="btn-ghost gap-2 !text-black" onClick={() => setLines([...lines, emptyLine()])}><PlusIcon /> {t('form.addItem')}</button>
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : t('form.submit')}</button>
      </form>
    </div>
  );
}

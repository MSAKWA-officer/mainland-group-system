import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warehouseApi, warehouseTransferApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { TrashIcon, PlusIcon } from '../../components/Icons.jsx';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import useLoad from '../../utils/useLoad';
import { qty } from '../stock/StockList.jsx';

const emptyEntry = () => ({ itemId: '', batchId: '', quantity: '' });
const today = () => new Date().toISOString().slice(0, 10);
const keyOf = (l) => `${l.itemId}|${l.batchId || ''}`;

// The storekeeper picks the source warehouse, the destination, then adds items one by one to a list.
// The whole list + one remarks box are saved together. Nothing moves yet: a Manager must approve first.
export default function WarehouseTransfersCreate() {
  const { t } = useTranslation('warehouseTransfers');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const mineW = useLoad(() => warehouseApi.options(), []);
  const allW = useLoad(() => warehouseApi.options({ all: true }), []);
  const [head, setHead] = useState({ fromWarehouseId: sp.get('from') || '', toWarehouseId: '', transferDate: today(), reason: '' });
  const [entry, setEntry] = useState(emptyEntry());   // the item being filled in
  const [list, setList] = useState([]);                // items already added
  const [err, setErr] = useState(''); const [entryErr, setEntryErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { const m = mineW.data; if (m && !head.fromWarehouseId && m.length === 1) setHead((h) => ({ ...h, fromWarehouseId: m[0].id })); }, [mineW.data]); // eslint-disable-line
  const [search, setSearch] = useState('');
  const stock = useLoad(() => (head.fromWarehouseId ? warehouseApi.stock(head.fromWarehouseId, { limit: 100, ...(search && { search }) }) : Promise.resolve(null)), [head.fromWarehouseId, search]);
  const [known, setKnown] = useState({});
  useEffect(() => { if (stock.data) setKnown((k) => { const n = { ...k }; stock.data.data.forEach((r) => { n[r.itemId] = r; }); return n; }); }, [stock.data]);
  const options = Object.values(known).filter((r) => r.warehouseId === head.fromWarehouseId || r.item);
  const row = known[entry.itemId];
  const batch = row?.batches?.find((b) => b.id === entry.batchId);

  const addToList = () => {
    setEntryErr('');
    if (!row) return setEntryErr(t('form.pickItem'));
    if (row.item.trackExpiry && !batch) return setEntryErr(t('form.pickBatch'));
    const q = Number(entry.quantity);
    if (!(q > 0)) return setEntryErr(t('form.pickQty'));
    const available = Number(batch ? batch.quantity : row.quantity);
    const k = keyOf(entry);
    const already = list.find((l) => keyOf(l) === k);
    if (q + (already ? already.quantity : 0) > available) return setEntryErr(t('form.overQty', { available: qty(available), unit: row.item.unit }));
    if (already) setList(list.map((l) => (keyOf(l) === k ? { ...l, quantity: l.quantity + q } : l)));   // same item/batch again: add to the same line
    else setList([...list, { itemId: row.itemId, batchId: batch?.id || '', quantity: q, item: row.item, batchNo: batch?.batchNo || '', expiryDate: batch?.expiryDate || '', available }]);
    setEntry(emptyEntry());
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!list.length) return setErr(t('form.noItems'));
    setBusy(true);
    try {
      const d = await warehouseTransferApi.create({ ...head, reason: head.reason.trim(),
        lines: list.map((l) => ({ itemId: l.itemId, quantity: l.quantity, ...(l.batchId && { batchId: l.batchId }) })) });
      navigate('/warehouse-transfers', { state: { msg: t('requested', { no: d.transferNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  const fromChanged = (v) => { setHead({ ...head, fromWarehouseId: v }); setKnown({}); setList([]); setEntry(emptyEntry()); setEntryErr(''); };
  const onEnter = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addToList(); } };
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
              <option value="">{t('form.selectWarehouse')}</option>{(allW.data || []).filter((w) => w.id !== head.fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}{w.salespersonNames ? ` (${t('form.salesperson')}: ${w.salespersonNames})` : ''}</option>)}
            </select>
            {(allW.data || []).find((w) => w.id === head.toWarehouseId)?.salespersonNames && <p className="mt-1 text-xs">{t('form.needsReceiptHint')}</p>}
          </Field>
          <Field label={t('form.date')} error={fe.transferDate}><input className="input !text-black" type="date" required value={head.transferDate} onChange={(e) => setHead({ ...head, transferDate: e.target.value })} /></Field>
        </div>

        {/* 1. fill in one item, then "Add to list" */}
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold">{t('form.items')}</h2>
            <input className="input max-w-xs !text-black" placeholder={t('form.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && ev.preventDefault()} disabled={!head.fromWarehouseId} />
          </div>
          <div className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-4">
            <div className="sm:col-span-2"><Field label={t('form.item')}>
              <select className="input !text-black" value={entry.itemId} disabled={!head.fromWarehouseId} onChange={(ev) => { setEntry({ itemId: ev.target.value, batchId: '', quantity: '' }); setEntryErr(''); }}>
                <option value="">{t('form.selectItem')}</option>
                {options.map((r) => <option key={r.itemId} value={r.itemId}>{r.item.sku} — {r.item.name} ({qty(r.quantity)} {r.item.unit})</option>)}
              </select></Field></div>
            {row?.item.trackExpiry && (
              <Field label={t('form.batch')}>
                <select className="input !text-black" value={entry.batchId} onChange={(ev) => setEntry({ ...entry, batchId: ev.target.value })}>
                  <option value="">{t('form.selectBatch')}</option>{row.batches.map((b) => <option key={b.id} value={b.id}>{b.batchNo} ({qty(b.quantity)}, {b.expiryDate})</option>)}
                </select></Field>
            )}
            <Field label={row ? t('form.quantityUnit', { unit: row.item.unit }) : t('form.quantity')}>
              <input className="input !text-black" type="number" min="0.001" step="0.001" value={entry.quantity} onKeyDown={onEnter} onChange={(ev) => setEntry({ ...entry, quantity: ev.target.value })} /></Field>
            <div className="flex items-end sm:col-span-4">
              <button type="button" className="btn-ghost gap-2 !text-black" onClick={addToList} disabled={!head.fromWarehouseId}><PlusIcon /> {t('form.addToList')}</button>
            </div>
            {entryErr && <p className="text-sm sm:col-span-4">{entryErr}</p>}
          </div>
        </div>

        {/* 2. the list of added items */}
        <div className="max-w-3xl space-y-2">
          <h2 className="text-base font-semibold">{t('form.listTitle')} ({list.length})</h2>
          <div className="overflow-x-auto"><table className="w-full border-collapse bg-white">
            <thead><tr>{['#', 'item', 'batch', 'quantity', ''].map((h, i) => <th key={i} className={`${HEAD} ${al(i)}`}>{h === '#' ? '#' : h ? t(`lineCols.${h}`) : ''}</th>)}</tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={5} className={`${CELL} text-center`}>{t('form.listEmpty')}</td></tr>}
              {list.map((l, i) => (
                <tr key={keyOf(l)}>
                  <td className={`${CELL} text-center`}>{i + 1}</td>
                  <td className={`${CELL} text-left`}><div>{l.item.name}</div><div className="text-xs">{l.item.sku}</div>{fe[`lines.${i}.quantity`] && <div className="text-xs">{fe[`lines.${i}.quantity`]}</div>}</td>
                  <td className={`${CELL} text-center`}>{l.batchNo ? `${l.batchNo} (${l.expiryDate})` : '—'}</td>
                  <td className={`${CELL} text-center`}>{qty(l.quantity)} {l.item.unit}</td>
                  <td className={`${CELL} text-center`}>
                    <button type="button" aria-label={t('form.removeLine')} title={t('form.removeLine')} onClick={() => setList(list.filter((_, n) => n !== i))} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-slate-100"><TrashIcon /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        {/* 3. one remarks box for the whole transfer, then save everything together */}
        <div className="max-w-3xl">
          <Field label={t('form.remarks')} error={fe.reason}>
            <textarea className="input !text-black" rows={3} required minLength={3} maxLength={1000} value={head.reason} onChange={(e) => setHead({ ...head, reason: e.target.value })} />
          </Field>
        </div>
        <button className="btn-primary" disabled={busy || !list.length}>{busy ? t('form.saving') : t('form.submit')}</button>
      </form>
    </div>
  );
}

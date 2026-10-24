import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { itemApi, stockApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import WarehouseField from '../../components/WarehouseField.jsx';
import { TrashIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { qty } from './StockList.jsx';

export const emptyLine = (itemId = '') => ({ itemId, direction: 'IN', quantity: '', unitCost: '', batchNo: '', expiryDate: '', batchId: '', remarks: '' });
export const today = () => new Date().toISOString().slice(0, 10);

// Turns the form into the API body. Fields that do not apply to a line (batch, cost) are left out.
export function buildPayload(head, lines, canCost, items) {
  return {
    docDate: head.docDate, warehouseId: head.warehouseId, reference: head.reference.trim() || null, reason: head.reason.trim(),
    lines: lines.map((l) => {
      const tracked = items[l.itemId]?.trackExpiry;
      return {
        itemId: l.itemId, direction: l.direction, quantity: Number(l.quantity), remarks: l.remarks.trim() || null,
        ...(l.direction === 'IN' && canCost && l.unitCost !== '' && l.unitCost != null && { unitCost: Number(l.unitCost) }),
        ...(tracked && l.direction === 'IN' && { batchNo: l.batchNo.trim(), expiryDate: l.expiryDate }),
        ...(tracked && l.direction === 'OUT' && { batchId: l.batchId }),
      };
    }),
  };
}

// One table row per item. Remarks are NOT per row: the editor below the table holds ONE remark that is applied to every item.
function LineRow({ l, i, item, options, set, remove, fe, canCost, canRemove, warehouseId, whQty }) {
  const { t } = useTranslation('stock');
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    if (item?.trackExpiry && l.direction === 'OUT') {       // batches of the chosen warehouse only (company-wide when no warehouse is chosen)
      stockApi.batches(item.id, warehouseId ? { warehouseId } : undefined).then((list) => {
        setBatches(list);
        if (warehouseId && l.batchId && !list.some((b) => b.id === l.batchId)) set(i, { batchId: '' });
      }).catch(() => setBatches([]));
    } else setBatches([]);
  }, [item?.id, item?.trackExpiry, l.direction, warehouseId]); // eslint-disable-line
  const e = (k) => fe[`lines.${i}.${k}`];
  const err = (k) => (e(k) ? <p className="mt-1 text-xs text-danger">{e(k)}</p> : null);
  const tracked = item?.trackExpiry;
  // With a warehouse chosen the quantity shown is that warehouse's stock, not the company total.
  const optionLabel = (o) => {
    if (!warehouseId) return t('lines.optionAdjust', { sku: o.sku, name: o.name, qty: qty(o.stock?.quantity), unit: o.unit });
    if (!whQty || whQty[o.id] === undefined) return t('lines.optionNoQty', { sku: o.sku, name: o.name });
    return t('lines.optionAdjustWh', { sku: o.sku, name: o.name, qty: qty(whQty[o.id]), unit: o.unit });
  };
  const td = 'border border-[#e5e7eb] px-2 py-2 align-top';
  return (
    <tr className="bg-white">
      <td className={`${td} w-10 text-center`}>{i + 1}</td>
      <td className={`${td} min-w-[230px]`}>
        <select className="input !text-black" required aria-label={t('lines.item')} value={l.itemId} onChange={(ev) => set(i, { itemId: ev.target.value, batchId: '', batchNo: '', expiryDate: '' })}>
          <option value="">{t('lines.selectItem')}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{optionLabel(o)}</option>)}
        </select>
        {err('itemId')}
      </td>
      <td className={`${td} min-w-[150px]`}>
        <select className="input !text-black" aria-label={t('lines.action')} value={l.direction} onChange={(ev) => set(i, { direction: ev.target.value, batchId: '', batchNo: '', expiryDate: '', unitCost: '' })}>
          <option value="IN">{t('lines.addStock')}</option><option value="OUT">{t('lines.removeStock')}</option>
        </select>
        {err('direction')}
      </td>
      <td className={`${td} w-32 min-w-[110px]`}>
        <input className="input !text-black" type="number" required min="0.001" step="0.001" aria-label={t('lines.quantity')} value={l.quantity} onChange={(ev) => set(i, { quantity: ev.target.value })} />
        {item?.unit && <p className="mt-1 text-xs">{item.unit}</p>}
        {err('quantity')}
      </td>
      <td className={`${td} min-w-[190px]`}>
        {tracked && l.direction === 'IN' && (
          <div className="space-y-2">
            <input className="input !text-black" required maxLength={60} placeholder={t('lines.batchNumber')} aria-label={t('lines.batchNumber')} value={l.batchNo} onChange={(ev) => set(i, { batchNo: ev.target.value })} />
            {err('batchNo')}
            <input className="input !text-black" type="date" required aria-label={t('lines.expiryDate')} title={t('lines.expiryDate')} value={l.expiryDate} onChange={(ev) => set(i, { expiryDate: ev.target.value })} />
            {err('expiryDate')}
          </div>
        )}
        {tracked && l.direction === 'OUT' && (
          <>
            <select className="input !text-black" required aria-label={t('lines.batch')} value={l.batchId} onChange={(ev) => set(i, { batchId: ev.target.value })}>
              <option value="">{t('lines.selectBatch')}</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{t(b.expired ? 'lines.batchOptionExpired' : 'lines.batchOption', { batchNo: b.batchNo, date: b.expiryDate, qty: qty(b.quantity) })}</option>)}
            </select>
            {err('batchId')}
          </>
        )}
        {!tracked && <span className="text-slate-400">—</span>}
      </td>
      {canCost && (
        <td className={`${td} w-32 min-w-[110px]`}>
          {l.direction === 'IN'
            ? <><input className="input !text-black" type="number" min="0" step="0.01" aria-label={t('lines.unitCost')} value={l.unitCost} onChange={(ev) => set(i, { unitCost: ev.target.value })} />{err('unitCost')}</>
            : <span className="text-slate-400">—</span>}
        </td>
      )}
      <td className={`${td} w-12 text-center`}>
        {canRemove && (
          <button type="button" title={t('lines.removeLine')} aria-label={t('lines.removeLine')} onClick={() => remove(i)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 transition hover:bg-slate-100"><TrashIcon /></button>
        )}
      </td>
    </tr>
  );
}

// Shared by StockCreate, StockUpdate and the Adjustments pages: item search, ONE table with a row per item, an add-item button and
// ONE remarks box for the whole table. The API stores remarks per line, so the single remark is copied to every line; the whole
// document (all rows) is saved together when the form is submitted.
export function LineEditor({ lines, setLines, fe = {}, warehouseId }) {
  const { t } = useTranslation('stock');
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState({});
  const asked = useRef(new Set());
  const found = useLoad(() => itemApi.list({ limit: 100, isActive: true, search: search || undefined }), [search]);
  // Quantities of the chosen warehouse for the same items (same search, same 100-item window).
  const whStock = useLoad(() => (warehouseId ? stockApi.list({ limit: 100, isActive: true, warehouseId, search: search || undefined }) : Promise.resolve(null)), [search, warehouseId]);
  const whQty = warehouseId && whStock.data ? Object.fromEntries(whStock.data.data.map((r) => [r.itemId, r.quantity])) : null;
  const addKnown = (arr) => setKnown((k) => { const n = { ...k }; arr.forEach((x) => { n[x.id] = x; }); return n; });
  useEffect(() => { if (found.data?.data) addKnown(found.data.data); }, [found.data]);
  // Items already on a line (prefilled or loaded from a saved draft) may not be in the search results.
  useEffect(() => {
    lines.forEach((l) => {
      if (l.itemId && !known[l.itemId] && !asked.current.has(l.itemId)) {
        asked.current.add(l.itemId); itemApi.get(l.itemId).then((x) => addKnown([x])).catch(() => {});
      }
    });
  }, [lines, known]);
  const set = (i, patch) => setLines(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const remove = (i) => setLines(lines.filter((_, n) => n !== i));
  const options = [...(found.data?.data || [])];
  lines.forEach((l) => { if (l.itemId && known[l.itemId] && !options.some((o) => o.id === l.itemId)) options.push(known[l.itemId]); });
  const canCost = can('items.view_cost');
  const shared = lines[0]?.remarks || '';                                        // the one remark shown for the whole table
  const setShared = (v) => setLines(lines.map((l) => ({ ...l, remarks: v })));   // typing it updates every line
  const remarksErr = Object.keys(fe).find((k) => /^lines\.\d+\.remarks$/.test(k));
  const th = 'h-[39px] border border-[#e5e7eb] bg-white px-2 py-2 text-left text-[14px] font-semibold uppercase';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">{t('lines.itemsToAdjust')}</h2>
        <input className="input max-w-xs !text-black" placeholder={t('lines.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Banner>{found.error}</Banner>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white text-[14px]">
          <thead>
            <tr>
              <th className={`${th} text-center`}>{t('lines.no')}</th>
              <th className={th}>{t('lines.item')}</th>
              <th className={th}>{t('lines.action')}</th>
              <th className={th}>{t('lines.quantity')}</th>
              <th className={th}>{t('lines.batchDetails')}</th>
              {canCost && <th className={th}>{t('lines.unitCost')}</th>}
              <th className={th}><span className="sr-only">{t('lines.removeLine')}</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <LineRow key={i} l={l} i={i} item={known[l.itemId]} options={options} set={set} remove={remove} fe={fe}
                canCost={canCost} canRemove={lines.length > 1} warehouseId={warehouseId} whQty={whQty} />
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-ghost gap-2 !text-black" onClick={() => setLines([...lines, { ...emptyLine(), remarks: shared }])}><PlusIcon /> {t('lines.addAnother')}</button>
      <Field label={t('lines.remarksAll')} error={remarksErr ? fe[remarksErr] : undefined}>
        <textarea className="input !text-black" rows={2} maxLength={255} value={shared} onChange={(e) => setShared(e.target.value)} />
      </Field>
    </div>
  );
}

export default function StockCreate() {
  const { t } = useTranslation('stock');
  const { t: tc } = useTranslation('docs');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [head, setHead] = useState({ docDate: today(), warehouseId: params.get('warehouseId') || '', reference: '', reason: '' });
  const [lines, setLines] = useState([emptyLine(params.get('itemId') || '')]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const known = useRef({});
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      // Tracked items need batch fields; look up the flag for each chosen item.
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (id) => { items[id] = known.current[id] || await itemApi.get(id); }));
      const d = await stockApi.createAdjustment(buildPayload(head, lines, can('items.view_cost'), items));
      navigate('/stock', { state: { tab: 'adjustments', msg: t('create.saved', { docNo: d.docNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/stock" className="text-sm hover:underline">{tc('backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err}</Banner>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label={t('create.date')} error={fe.docDate}><input className="input !text-black" type="date" required value={head.docDate} onChange={(e) => setHead({ ...head, docDate: e.target.value })} /></Field>
          <WarehouseField head={head} setHead={setHead} fe={fe} />
          <Field label={t('create.reference')} error={fe.reference}><input className="input !text-black" maxLength={100} value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('create.reason')} error={fe.reason}><textarea className="input !text-black" rows={3} required minLength={3} maxLength={1000} value={head.reason} onChange={(e) => setHead({ ...head, reason: e.target.value })} /></Field></div>
        </div>
        <div className="max-w-6xl"><LineEditor lines={lines} setLines={setLines} fe={fe} warehouseId={head.warehouseId} /></div>
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.saveDraft')}</button>
      </form>
    </div>
  );
}

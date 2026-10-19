import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { itemApi, stockApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
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

function LineRow({ l, i, item, options, set, remove, fe, canCost, canRemove, warehouseId }) {
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
  const tracked = item?.trackExpiry;
  return (
    <div className="rounded-md border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label={t('lines.item')} error={e('itemId')}>
            <select className="input !text-black" required value={l.itemId} onChange={(ev) => set(i, { itemId: ev.target.value, batchId: '', batchNo: '', expiryDate: '' })}>
              <option value="">{t('lines.selectItem')}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{t('lines.optionAdjust', { sku: o.sku, name: o.name, qty: qty(o.stock?.quantity), unit: o.unit })}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('lines.action')} error={e('direction')}>
          <select className="input !text-black" value={l.direction} onChange={(ev) => set(i, { direction: ev.target.value, batchId: '', batchNo: '', expiryDate: '', unitCost: '' })}>
            <option value="IN">{t('lines.addStock')}</option><option value="OUT">{t('lines.removeStock')}</option>
          </select>
        </Field>
        <Field label={item ? t('lines.quantityUnit', { label: t('lines.quantity'), unit: item.unit }) : t('lines.quantity')} error={e('quantity')}>
          <input className="input !text-black" type="number" required min="0.001" step="0.001" value={l.quantity} onChange={(ev) => set(i, { quantity: ev.target.value })} />
        </Field>
        {tracked && l.direction === 'IN' && (
          <>
            <Field label={t('lines.batchNumber')} error={e('batchNo')}><input className="input !text-black" required maxLength={60} value={l.batchNo} onChange={(ev) => set(i, { batchNo: ev.target.value })} /></Field>
            <Field label={t('lines.expiryDate')} error={e('expiryDate')}><input className="input !text-black" type="date" required value={l.expiryDate} onChange={(ev) => set(i, { expiryDate: ev.target.value })} /></Field>
          </>
        )}
        {tracked && l.direction === 'OUT' && (
          <div className="sm:col-span-2">
            <Field label={t('lines.batch')} error={e('batchId')}>
              <select className="input !text-black" required value={l.batchId} onChange={(ev) => set(i, { batchId: ev.target.value })}>
                <option value="">{t('lines.selectBatch')}</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{t(b.expired ? 'lines.batchOptionExpired' : 'lines.batchOption', { batchNo: b.batchNo, date: b.expiryDate, qty: qty(b.quantity) })}</option>)}
              </select>
            </Field>
          </div>
        )}
        {canCost && l.direction === 'IN' && (
          <Field label={t('lines.unitCost')} error={e('unitCost')}><input className="input !text-black" type="number" min="0" step="0.01" value={l.unitCost} onChange={(ev) => set(i, { unitCost: ev.target.value })} /></Field>
        )}
        <div className="sm:col-span-3"><Field label={t('lines.remarks')} error={e('remarks')}><input className="input !text-black" maxLength={255} value={l.remarks} onChange={(ev) => set(i, { remarks: ev.target.value })} /></Field></div>
        <div className="flex items-end justify-end">
          {canRemove && (
            <button type="button" title={t('lines.removeLine')} aria-label={t('lines.removeLine')} onClick={() => remove(i)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 transition hover:bg-slate-100"><TrashIcon /></button>
          )}
        </div>
      </div>
    </div>
  );
}

// Shared by StockCreate and StockUpdate: item search, one editable card per line, and an add-line button.
export function LineEditor({ lines, setLines, fe = {}, warehouseId }) {
  const { t } = useTranslation('stock');
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState({});
  const asked = useRef(new Set());
  const found = useLoad(() => itemApi.list({ limit: 100, isActive: true, search: search || undefined }), [search]);
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
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">{t('lines.itemsToAdjust')}</h2>
        <input className="input max-w-xs !text-black" placeholder={t('lines.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Banner>{found.error}</Banner>
      {lines.map((l, i) => (
        <LineRow key={i} l={l} i={i} item={known[l.itemId]} options={options} set={set} remove={remove} fe={fe}
          canCost={can('items.view_cost')} canRemove={lines.length > 1} warehouseId={warehouseId} />
      ))}
      <button type="button" className="btn-ghost gap-2 !text-black" onClick={() => setLines([...lines, emptyLine()])}><PlusIcon /> {t('lines.addAnother')}</button>
    </div>
  );
}

export default function StockCreate() {
  const { t } = useTranslation('stock');
  const { t: tc } = useTranslation('docs');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [head, setHead] = useState({ docDate: today(), reference: '', reason: '' });
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
          <Field label={t('create.reference')} error={fe.reference}><input className="input !text-black" maxLength={100} value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('create.reason')} error={fe.reason}><textarea className="input !text-black" rows={3} required minLength={3} maxLength={1000} value={head.reason} onChange={(e) => setHead({ ...head, reason: e.target.value })} /></Field></div>
        </div>
        <div className="max-w-3xl"><LineEditor lines={lines} setLines={setLines} fe={fe} /></div>
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.saveDraft')}</button>
      </form>
    </div>
  );
}

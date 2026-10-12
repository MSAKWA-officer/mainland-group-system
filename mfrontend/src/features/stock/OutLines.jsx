import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { itemApi, stockApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { TrashIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { qty } from './StockList.jsx';

// Shared by Reject out, Expired and Damaged: every line removes stock, and items that track expiry need a batch.
export const emptyOutLine = () => ({ itemId: '', quantity: '', batchId: '', remarks: '' });
export const today = () => new Date().toISOString().slice(0, 10);

// Turns the form into the API body. batchId is sent only for items that track expiry.
export function buildOutPayload(head, lines, items, withParty) {
  return {
    docDate: head.docDate, reference: head.reference.trim() || null, reason: head.reason.trim() || null,
    ...(withParty && { partyName: head.partyName.trim() || null }),
    lines: lines.map((l) => ({
      itemId: l.itemId, quantity: Number(l.quantity), remarks: l.remarks.trim() || null,
      ...(items[l.itemId]?.trackExpiry && { batchId: l.batchId }),
    })),
  };
}

function OutLineRow({ l, i, item, options, set, remove, fe, canRemove, qtyLabel }) {
  const { t } = useTranslation('stock');
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    if (item?.trackExpiry) stockApi.batches(item.id).then(setBatches).catch(() => setBatches([]));
    else setBatches([]);
  }, [item?.id, item?.trackExpiry]);
  const e = (k) => fe[`lines.${i}.${k}`];
  return (
    <div className="rounded-md border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label={t('lines.item')} error={e('itemId')}>
            <select className="input !text-black" required value={l.itemId} onChange={(ev) => set(i, { itemId: ev.target.value, batchId: '' })}>
              <option value="">{t('lines.selectItem')}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{t('lines.optionOut', { sku: o.sku, name: o.name, qty: qty(o.stock?.quantity), unit: o.unit })}</option>)}
            </select>
          </Field>
        </div>
        <Field label={item ? t('lines.quantityUnit', { label: qtyLabel, unit: item.unit }) : qtyLabel} error={e('quantity')}>
          <input className="input !text-black" type="number" required min="0.001" step="0.001" value={l.quantity} onChange={(ev) => set(i, { quantity: ev.target.value })} />
        </Field>
        {item?.trackExpiry && (
          <Field label={t('lines.batch')} error={e('batchId')}>
            <select className="input !text-black" required value={l.batchId} onChange={(ev) => set(i, { batchId: ev.target.value })}>
              <option value="">{t('lines.selectBatch')}</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{t(b.expired ? 'lines.batchOptionExpired' : 'lines.batchOption', { batchNo: b.batchNo, date: b.expiryDate, qty: qty(b.quantity) })}</option>)}
            </select>
          </Field>
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

// Item search, one editable card per line, and an add-line button. expiryOnly limits the search to items that track expiry.
export function OutLineEditor({ lines, setLines, fe = {}, title, qtyLabel, expiryOnly }) {
  const { t } = useTranslation('stock');
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState({});
  const asked = useRef(new Set());
  const found = useLoad(() => itemApi.list({ limit: 100, search: search || undefined, ...(expiryOnly && { trackExpiry: true }) }), [search, expiryOnly]);
  const addKnown = (arr) => setKnown((k) => { const n = { ...k }; arr.forEach((x) => { n[x.id] = x; }); return n; });
  useEffect(() => { if (found.data?.data) addKnown(found.data.data); }, [found.data]);
  // Items already on a line (loaded from a saved draft) may not be in the search results.
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
        <h2 className="text-base font-semibold">{title}</h2>
        <input className="input max-w-xs !text-black" placeholder={t('lines.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Banner>{found.error}</Banner>
      {lines.map((l, i) => (
        <OutLineRow key={i} l={l} i={i} item={known[l.itemId]} options={options} set={set} remove={remove} fe={fe}
          canRemove={lines.length > 1} qtyLabel={qtyLabel} />
      ))}
      <button type="button" className="btn-ghost gap-2 !text-black" onClick={() => setLines([...lines, emptyOutLine()])}><PlusIcon /> {t('lines.addAnother')}</button>
    </div>
  );
}

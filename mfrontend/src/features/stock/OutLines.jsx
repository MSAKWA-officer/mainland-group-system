import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { itemApi, stockApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { TrashIcon, PlusIcon, PencilIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { qty } from './StockList.jsx';

// Shared by Reject out, Expired and Damaged: every line removes stock, and items that track expiry need a batch.
export const emptyOutLine = () => ({ itemId: '', quantity: '', batchId: '', remarks: '' });
export const today = () => new Date().toISOString().slice(0, 10);

// Turns the form into the API body. batchId is sent only for items that track expiry.
export function buildOutPayload(head, lines, items, withParty) {
  return {
    docDate: head.docDate, warehouseId: head.warehouseId, reference: head.reference.trim() || null, reason: head.reason.trim() || null,
    ...(withParty && { partyName: head.partyName.trim() || null }),
    lines: lines.map((l) => ({
      itemId: l.itemId, quantity: Number(l.quantity), remarks: l.remarks.trim() || null,
      ...(items[l.itemId]?.trackExpiry && { batchId: l.batchId }),
    })),
  };
}

function OutLineRow({ l, i, item, options, set, remove, fe, canRemove, qtyLabel, warehouseId }) {
  const { t } = useTranslation('stock');
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    // Batches of the CHOSEN warehouse only. A batch picked for another warehouse is dropped.
    if (item?.trackExpiry) {
      stockApi.batches(item.id, warehouseId ? { warehouseId } : undefined).then((list) => {
        setBatches(list);
        if (warehouseId && l.batchId && !list.some((b) => b.id === l.batchId)) set(i, { batchId: '' });
      }).catch(() => setBatches([]));
    } else setBatches([]);
  }, [item?.id, item?.trackExpiry, warehouseId]); // eslint-disable-line
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
export function OutLineEditor({ lines, setLines, fe = {}, title, qtyLabel, expiryOnly, warehouseId }) {
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
          canRemove={lines.length > 1} qtyLabel={qtyLabel} warehouseId={warehouseId} />
      ))}
      <button type="button" className="btn-ghost gap-2 !text-black" onClick={() => setLines([...lines, emptyOutLine()])}><PlusIcon /> {t('lines.addAnother')}</button>
    </div>
  );
}

// Used by the New Reject out / Damaged pages (Expired and the Update pages keep OutLineEditor above).
//  1. Pick an item (and its batch if it tracks expiry), enter the quantity and press "Add to list".
//  2. Added items pile up in ONE table below (each can be edited or removed).
//  3. ONE remarks box under the table applies to every item; the whole list is saved together by the page's Save button.
// The API stores remarks per line, so the single remark is copied to every line.
export function OutListEditor({ lines, setLines, fe = {}, title, qtyLabel, expiryOnly, warehouseId }) {
  const { t } = useTranslation('stock');
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState({});
  const [draft, setDraft] = useState(emptyOutLine());
  const [draftErr, setDraftErr] = useState('');
  const [batches, setBatches] = useState([]);
  const [shared, setSharedState] = useState('');
  const found = useLoad(() => itemApi.list({ limit: 100, search: search || undefined, ...(expiryOnly && { trackExpiry: true }) }), [search, expiryOnly]);
  const addKnown = (arr) => setKnown((k) => { const n = { ...k }; arr.forEach((x) => { n[x.id] = x; }); return n; });
  useEffect(() => { if (found.data?.data) addKnown(found.data.data); }, [found.data]);
  const dItem = known[draft.itemId];
  const tracked = dItem?.trackExpiry;
  useEffect(() => {   // batches of the CHOSEN warehouse only; a batch picked for another warehouse is dropped
    if (tracked) {
      stockApi.batches(dItem.id, warehouseId ? { warehouseId } : undefined).then((list) => {
        setBatches(list);
        if (warehouseId && draft.batchId && !list.some((b) => b.id === draft.batchId)) setDraft((d) => ({ ...d, batchId: '' }));
      }).catch(() => setBatches([]));
    } else setBatches([]);
  }, [dItem?.id, tracked, warehouseId]); // eslint-disable-line
  const options = [...(found.data?.data || [])];
  if (dItem && !options.some((o) => o.id === dItem.id)) options.push(dItem);
  const patch = (p) => { setDraftErr(''); setDraft((d) => ({ ...d, ...p })); };
  const key = (x) => `${x.itemId}|${x.batchId || ''}`;

  const addToList = () => {
    if (!draft.itemId) return setDraftErr(t('lines.errItem'));
    if (!(Number(draft.quantity) > 0)) return setDraftErr(t('lines.errQty'));
    if (tracked && !draft.batchId) return setDraftErr(t('lines.errBatchOut'));
    if (lines.some((x) => key(x) === key(draft))) return setDraftErr(t('lines.errDuplicate'));
    const b = batches.find((x) => x.id === draft.batchId);
    setLines([...lines, { ...draft, remarks: shared, batchLabel: b ? `${b.batchNo} — ${b.expiryDate}` : (draft.batchLabel || '') }]);
    setDraft(emptyOutLine()); setDraftErr('');
  };
  const editLine = (i) => { setDraft({ ...lines[i] }); setDraftErr(''); setLines(lines.filter((_, n) => n !== i)); };   // back into the entry box
  const remove = (i) => setLines(lines.filter((_, n) => n !== i));
  const setShared = (v) => { setSharedState(v); setLines(lines.map((l) => ({ ...l, remarks: v }))); };
  const onKey = (e) => {   // Enter in the entry box adds the item instead of saving the whole form
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    if (!e.target.dataset.search) addToList();
  };
  const remarksErr = Object.keys(fe).find((k) => /^lines\.\d+\.remarks$/.test(k));
  const rowErr = (i) => Object.entries(fe).filter(([k]) => k.startsWith(`lines.${i}.`) && !k.endsWith('.remarks')).map(([, v]) => v).join(' ');
  const th = 'h-[39px] border border-[#e5e7eb] bg-white px-2 py-2 text-left text-[14px] font-semibold uppercase';
  const td = 'border border-[#e5e7eb] px-2 py-2 align-top text-[14px]';

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <Banner>{found.error}</Banner>

      {/* 1. Entry box */}
      <div className="rounded-md border border-line p-4" onKeyDown={onKey}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-semibold">{t('lines.addItemTitle')}</h3>
          <input data-search="1" className="input max-w-xs !text-black" placeholder={t('lines.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label={t('lines.item')}>
              <select className="input !text-black" value={draft.itemId} onChange={(ev) => patch({ itemId: ev.target.value, batchId: '', batchLabel: '' })}>
                <option value="">{t('lines.selectItem')}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{t('lines.optionOut', { sku: o.sku, name: o.name, qty: qty(o.stock?.quantity), unit: o.unit })}</option>)}
              </select>
            </Field>
          </div>
          <Field label={dItem ? t('lines.quantityUnit', { label: qtyLabel, unit: dItem.unit }) : qtyLabel}>
            <input className="input !text-black" type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(ev) => patch({ quantity: ev.target.value })} />
          </Field>
          {tracked && (
            <Field label={t('lines.batch')}>
              <select className="input !text-black" value={draft.batchId} onChange={(ev) => patch({ batchId: ev.target.value })}>
                <option value="">{t('lines.selectBatch')}</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{t(b.expired ? 'lines.batchOptionExpired' : 'lines.batchOption', { batchNo: b.batchNo, date: b.expiryDate, qty: qty(b.quantity) })}</option>)}
              </select>
            </Field>
          )}
        </div>
        {draftErr && <p className="mt-3 text-sm text-danger">{draftErr}</p>}
        <div className="mt-4"><button type="button" className="btn-primary gap-2" onClick={addToList}><PlusIcon /> {t('lines.addToList')}</button></div>
      </div>

      {/* 2. The list of added items */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{title} ({lines.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={`${th} text-center`}>{t('lines.no')}</th>
                <th className={th}>{t('lines.item')}</th>
                <th className={th}>{t('lines.quantity')}</th>
                <th className={th}>{t('lines.batchDetails')}</th>
                <th className={th}><span className="sr-only">{t('lines.edit')}</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td className={`${td} text-center`} colSpan={5}>{t('lines.emptyList')}</td></tr>}
              {lines.map((l, i) => {
                const it = known[l.itemId]; const bad = rowErr(i);
                return (
                  <tr key={`${key(l)}-${i}`} className="bg-white">
                    <td className={`${td} w-10 text-center`}>{i + 1}</td>
                    <td className={td}>{it ? `${it.sku} — ${it.name}` : '…'}{bad && <p className="mt-1 text-xs text-danger">{bad}</p>}</td>
                    <td className={td}>{qty(l.quantity)} {it?.unit || ''}</td>
                    <td className={td}>{it?.trackExpiry ? (l.batchLabel || '…') : <span className="text-slate-400">—</span>}</td>
                    <td className={`${td} w-24 whitespace-nowrap text-center`}>
                      <button type="button" title={t('lines.edit')} aria-label={t('lines.edit')} onClick={() => editLine(i)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md transition hover:bg-slate-100"><PencilIcon /></button>
                      <button type="button" title={t('lines.removeLine')} aria-label={t('lines.removeLine')} onClick={() => remove(i)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 transition hover:bg-slate-100"><TrashIcon /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. One remark for the whole list */}
      <Field label={t('lines.remarksAll')} error={remarksErr ? fe[remarksErr] : undefined}>
        <textarea className="input !text-black" rows={2} maxLength={255} value={shared} onChange={(e) => setShared(e.target.value)} />
      </Field>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { itemApi, stockApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import WarehouseField from '../../components/WarehouseField.jsx';
import { TrashIcon, PlusIcon, PencilIcon } from '../../components/Icons.jsx';
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

// "Batch / expiry" text of a row in the list. Adding stock shows the batch typed in; removing stock shows the chosen batch.
function BatchCell({ l, item, warehouseId }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (item?.trackExpiry && l.direction === 'OUT' && l.batchId) {
      stockApi.batches(item.id, warehouseId ? { warehouseId } : undefined)
        .then((list) => { const b = list.find((x) => x.id === l.batchId); setLabel(b ? `${b.batchNo} — ${b.expiryDate}` : ''); }).catch(() => {});
    }
  }, [item?.id, item?.trackExpiry, l.batchId, l.direction, warehouseId]); // eslint-disable-line
  if (!item?.trackExpiry) return <span className="text-slate-400">—</span>;
  if (l.direction === 'IN') return <>{l.batchNo} — {l.expiryDate}</>;
  return <>{label || '…'}</>;
}

// Shared by StockCreate, StockUpdate and the Adjustments pages.
//  1. Pick an item, fill in its details and press "Add to list".
//  2. Added items pile up in ONE table below (each can be edited or removed).
//  3. ONE remarks box under the table applies to every item; the whole list is saved together by the page's Save button.
// `lines` holds only items that were added to the list. The API stores remarks per line, so the single remark is copied to every line.
export function LineEditor({ lines, setLines, fe = {}, warehouseId, initialItemId = '' }) {
  const { t } = useTranslation('stock');
  const { can } = useAuth();
  const canCost = can('items.view_cost');
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState({});
  const [draft, setDraft] = useState(() => emptyLine(initialItemId));
  const [draftErr, setDraftErr] = useState('');
  const [batches, setBatches] = useState([]);
  const [shared, setSharedState] = useState('');
  const seeded = useRef(false);
  const asked = useRef(new Set());
  const found = useLoad(() => itemApi.list({ limit: 100, isActive: true, search: search || undefined }), [search]);
  // Quantities of the chosen warehouse for the same items (same search, same 100-item window).
  const whStock = useLoad(() => (warehouseId ? stockApi.list({ limit: 100, isActive: true, warehouseId, search: search || undefined }) : Promise.resolve(null)), [search, warehouseId]);
  const whQty = warehouseId && whStock.data ? Object.fromEntries(whStock.data.data.map((r) => [r.itemId, r.quantity])) : null;
  const addKnown = (arr) => setKnown((k) => { const n = { ...k }; arr.forEach((x) => { n[x.id] = x; }); return n; });
  useEffect(() => { if (found.data?.data) addKnown(found.data.data); }, [found.data]);
  // Items on the list (loaded from a saved draft) or in the entry box may not be in the search results.
  useEffect(() => {
    [...lines.map((l) => l.itemId), draft.itemId].forEach((id) => {
      if (id && !known[id] && !asked.current.has(id)) { asked.current.add(id); itemApi.get(id).then((x) => addKnown([x])).catch(() => {}); }
    });
  }, [lines, draft.itemId, known]);
  // A saved draft opened for editing: show its remark in the single remarks box.
  useEffect(() => { if (!seeded.current && lines.length) { seeded.current = true; setSharedState(lines[0].remarks || ''); } }, [lines]);

  const dItem = known[draft.itemId];
  const dTracked = dItem?.trackExpiry;
  useEffect(() => {   // batches of the chosen warehouse (company-wide when no warehouse is chosen) for removing tracked stock
    if (dTracked && draft.direction === 'OUT') {
      stockApi.batches(dItem.id, warehouseId ? { warehouseId } : undefined).then((list) => {
        setBatches(list);
        if (warehouseId && draft.batchId && !list.some((b) => b.id === draft.batchId)) setDraft((d) => ({ ...d, batchId: '' }));
      }).catch(() => setBatches([]));
    } else setBatches([]);
  }, [dItem?.id, dTracked, draft.direction, warehouseId]); // eslint-disable-line

  const options = [...(found.data?.data || [])];
  if (dItem && !options.some((o) => o.id === dItem.id)) options.push(dItem);
  // With a warehouse chosen the quantity shown is that warehouse's stock, not the company total.
  const optionLabel = (o) => {
    if (!warehouseId) return t('lines.optionAdjust', { sku: o.sku, name: o.name, qty: qty(o.stock?.quantity), unit: o.unit });
    if (!whQty || whQty[o.id] === undefined) return t('lines.optionNoQty', { sku: o.sku, name: o.name });
    return t('lines.optionAdjustWh', { sku: o.sku, name: o.name, qty: qty(whQty[o.id]), unit: o.unit });
  };
  const patch = (p) => { setDraftErr(''); setDraft((d) => ({ ...d, ...p })); };
  const key = (x) => `${x.itemId}|${x.direction}|${x.batchId || x.batchNo || ''}`;

  const addToList = () => {
    if (!draft.itemId) return setDraftErr(t('lines.errItem'));
    if (!(Number(draft.quantity) > 0)) return setDraftErr(t('lines.errQty'));
    if (dTracked && draft.direction === 'IN' && (!draft.batchNo.trim() || !draft.expiryDate)) return setDraftErr(t('lines.errBatchIn'));
    if (dTracked && draft.direction === 'OUT' && !draft.batchId) return setDraftErr(t('lines.errBatchOut'));
    if (lines.some((x) => key(x) === key(draft))) return setDraftErr(t('lines.errDuplicate'));
    setLines([...lines, { ...draft, remarks: shared }]);
    setDraft({ ...emptyLine(), direction: draft.direction });   // ready for the next item; the action (+ / −) stays as it was
    setDraftErr('');
  };
  const editLine = (i) => { setDraft({ ...lines[i] }); setDraftErr(''); setLines(lines.filter((_, n) => n !== i)); };   // back into the entry box
  const remove = (i) => setLines(lines.filter((_, n) => n !== i));
  const setShared = (v) => { seeded.current = true; setSharedState(v); setLines(lines.map((l) => ({ ...l, remarks: v }))); };
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
      <h2 className="text-base font-semibold">{t('lines.itemsToAdjust')}</h2>
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
              <select className="input !text-black" value={draft.itemId} onChange={(ev) => patch({ itemId: ev.target.value, batchId: '', batchNo: '', expiryDate: '' })}>
                <option value="">{t('lines.selectItem')}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{optionLabel(o)}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('lines.action')}>
            <select className="input !text-black" value={draft.direction} onChange={(ev) => patch({ direction: ev.target.value, batchId: '', batchNo: '', expiryDate: '', unitCost: '' })}>
              <option value="IN">{t('lines.addStock')}</option><option value="OUT">{t('lines.removeStock')}</option>
            </select>
          </Field>
          <Field label={dItem ? t('lines.quantityUnit', { label: t('lines.quantity'), unit: dItem.unit }) : t('lines.quantity')}>
            <input className="input !text-black" type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(ev) => patch({ quantity: ev.target.value })} />
          </Field>
          {dTracked && draft.direction === 'IN' && (
            <>
              <Field label={t('lines.batchNumber')}><input className="input !text-black" maxLength={60} value={draft.batchNo} onChange={(ev) => patch({ batchNo: ev.target.value })} /></Field>
              <Field label={t('lines.expiryDate')}><input className="input !text-black" type="date" value={draft.expiryDate} onChange={(ev) => patch({ expiryDate: ev.target.value })} /></Field>
            </>
          )}
          {dTracked && draft.direction === 'OUT' && (
            <div className="sm:col-span-2">
              <Field label={t('lines.batch')}>
                <select className="input !text-black" value={draft.batchId} onChange={(ev) => patch({ batchId: ev.target.value })}>
                  <option value="">{t('lines.selectBatch')}</option>
                  {batches.map((b) => <option key={b.id} value={b.id}>{t(b.expired ? 'lines.batchOptionExpired' : 'lines.batchOption', { batchNo: b.batchNo, date: b.expiryDate, qty: qty(b.quantity) })}</option>)}
                </select>
              </Field>
            </div>
          )}
          {canCost && draft.direction === 'IN' && (
            <Field label={t('lines.unitCost')}><input className="input !text-black" type="number" min="0" step="0.01" value={draft.unitCost} onChange={(ev) => patch({ unitCost: ev.target.value })} /></Field>
          )}
        </div>
        {draftErr && <p className="mt-3 text-sm text-danger">{draftErr}</p>}
        <div className="mt-4"><button type="button" className="btn-primary gap-2" onClick={addToList}><PlusIcon /> {t('lines.addToList')}</button></div>
      </div>

      {/* 2. The list of added items */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('lines.listTitle', { count: lines.length })}</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={`${th} text-center`}>{t('lines.no')}</th>
                <th className={th}>{t('lines.item')}</th>
                <th className={th}>{t('lines.action')}</th>
                <th className={th}>{t('lines.quantity')}</th>
                <th className={th}>{t('lines.batchDetails')}</th>
                {canCost && <th className={th}>{t('lines.unitCost')}</th>}
                <th className={th}><span className="sr-only">{t('lines.edit')}</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td className={`${td} text-center`} colSpan={canCost ? 7 : 6}>{t('lines.emptyList')}</td></tr>}
              {lines.map((l, i) => {
                const it = known[l.itemId]; const bad = rowErr(i);
                return (
                  <tr key={`${key(l)}-${i}`} className="bg-white">
                    <td className={`${td} w-10 text-center`}>{i + 1}</td>
                    <td className={td}>{it ? `${it.sku} — ${it.name}` : '…'}{bad && <p className="mt-1 text-xs text-danger">{bad}</p>}</td>
                    <td className={td}>{l.direction === 'IN' ? t('lines.addStock') : t('lines.removeStock')}</td>
                    <td className={td}>{qty(l.quantity)} {it?.unit || ''}</td>
                    <td className={td}><BatchCell l={l} item={it} warehouseId={warehouseId} /></td>
                    {canCost && <td className={td}>{l.direction === 'IN' && l.unitCost !== '' && l.unitCost != null ? l.unitCost : <span className="text-slate-400">—</span>}</td>}
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

export default function StockCreate() {
  const { t } = useTranslation('stock');
  const { t: tc } = useTranslation('docs');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [head, setHead] = useState({ docDate: today(), warehouseId: params.get('warehouseId') || '', reference: '', reason: '' });
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const known = useRef({});
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!lines.length) { setErr(t('lines.noItems')); return; }
    setBusy(true);
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
        <div className="max-w-6xl"><LineEditor lines={lines} setLines={setLines} fe={fe} warehouseId={head.warehouseId} initialItemId={params.get('itemId') || ''} /></div>
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.saveDraft')}</button>
      </form>
    </div>
  );
}

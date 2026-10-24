import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { itemApi, receivingApi, warehouseApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { TrashIcon, PlusIcon, PencilIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { qty } from '../stock/StockList.jsx';
import { useDocText } from '../../utils/docText';

export const emptyLine = () => ({ itemId: '', quantity: '', unitCost: '', batchNo: '', expiryDate: '', remarks: '' });
export const today = () => new Date().toISOString().slice(0, 10);

// Turns the form into the API body. Batch fields are sent only for items that track expiry.
export function buildPayload(head, lines, canCost, items, autoRef = false) {
  return {
    docDate: head.docDate, warehouseId: head.warehouseId, partyName: head.partyName.trim() || null, reason: head.reason.trim() || null,
    ...(!autoRef && { reference: head.reference.trim() || null }),   // on create the server generates the reference number
    lines: lines.map((l) => ({
      itemId: l.itemId, quantity: Number(l.quantity), remarks: l.remarks.trim() || null,
      ...(canCost && l.unitCost !== '' && l.unitCost != null && { unitCost: Number(l.unitCost) }),
      ...(items[l.itemId]?.trackExpiry && { batchNo: l.batchNo.trim(), expiryDate: l.expiryDate }),
    })),
  };
}

function LineRow({ l, i, item, options, set, remove, fe, canCost, canRemove }) {
  const { t } = useTranslation('receiving');
  const e = (k) => fe[`lines.${i}.${k}`];
  return (
    <div className="rounded-md border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label={t('form.item')} error={e('itemId')}>
            <select className="input !text-black" required value={l.itemId} onChange={(ev) => set(i, { itemId: ev.target.value, batchNo: '', expiryDate: '' })}>
              <option value="">{t('form.selectItem')}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{t('form.itemOption', { sku: o.sku, name: o.name, qty: qty(o.stock?.quantity), unit: o.unit })}</option>)}
            </select>
          </Field>
        </div>
        <Field label={item ? t('form.quantityUnit', { unit: item.unit }) : t('form.quantity')} error={e('quantity')}>
          <input className="input !text-black" type="number" required min="0.001" step="0.001" value={l.quantity} onChange={(ev) => set(i, { quantity: ev.target.value })} />
        </Field>
        {canCost && (
          <Field label={t('form.unitCost')} error={e('unitCost')}><input className="input !text-black" type="number" min="0" step="0.01" value={l.unitCost} onChange={(ev) => set(i, { unitCost: ev.target.value })} /></Field>
        )}
        {item?.trackExpiry && (
          <>
            <Field label={t('form.batchNo')} error={e('batchNo')}><input className="input !text-black" required maxLength={60} value={l.batchNo} onChange={(ev) => set(i, { batchNo: ev.target.value })} /></Field>
            <Field label={t('form.expiryDate')} error={e('expiryDate')}><input className="input !text-black" type="date" required value={l.expiryDate} onChange={(ev) => set(i, { expiryDate: ev.target.value })} /></Field>
          </>
        )}
        <div className="sm:col-span-3"><Field label={t('form.remarks')} error={e('remarks')}><input className="input !text-black" maxLength={255} value={l.remarks} onChange={(ev) => set(i, { remarks: ev.target.value })} /></Field></div>
        <div className="flex items-end justify-end">
          {canRemove && (
            <button type="button" title={t('form.removeLine')} aria-label={t('form.removeLine')} onClick={() => remove(i)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 transition hover:bg-slate-100"><TrashIcon /></button>
          )}
        </div>
      </div>
    </div>
  );
}

// Shared by ReceivingCreate and ReceivingUpdate: item search, one editable card per line, and an add-line button.
export function LineEditor({ lines, setLines, fe = {} }) {
  const { t } = useTranslation('receiving');
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState({});
  const asked = useRef(new Set());
  const found = useLoad(() => itemApi.list({ limit: 100, isActive: true, search: search || undefined }), [search]);
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
        <h2 className="text-base font-semibold">{t('form.itemsReceived')}</h2>
        <input className="input max-w-xs !text-black" placeholder={t('form.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Banner>{found.error}</Banner>
      {lines.map((l, i) => (
        <LineRow key={i} l={l} i={i} item={known[l.itemId]} options={options} set={set} remove={remove} fe={fe}
          canCost={can('items.view_cost')} canRemove={lines.length > 1} />
      ))}
      <button type="button" className="btn-ghost gap-2 !text-black" onClick={() => setLines([...lines, emptyLine()])}><PlusIcon /> {t('form.addItem')}</button>
    </div>
  );
}

// Used by the New receiving page only (ReceivingUpdate keeps LineEditor above).
//  1. Pick an item, fill in its details and press "Add to list".
//  2. Added items pile up in ONE table below (each can be edited or removed).
//  3. ONE remarks box under the table applies to every item; the whole list is saved together by the page's Save button.
// The API stores remarks per line, so the single remark is copied to every line.
export function ListLineEditor({ lines, setLines, fe = {} }) {
  const { t } = useTranslation('receiving');
  const { can } = useAuth();
  const canCost = can('items.view_cost');
  const [search, setSearch] = useState('');
  const [known, setKnown] = useState({});
  const [draft, setDraft] = useState(emptyLine());
  const [draftErr, setDraftErr] = useState('');
  const [shared, setSharedState] = useState('');
  const found = useLoad(() => itemApi.list({ limit: 100, isActive: true, search: search || undefined }), [search]);
  const addKnown = (arr) => setKnown((k) => { const n = { ...k }; arr.forEach((x) => { n[x.id] = x; }); return n; });
  useEffect(() => { if (found.data?.data) addKnown(found.data.data); }, [found.data]);
  const dItem = known[draft.itemId];
  const options = [...(found.data?.data || [])];
  if (dItem && !options.some((o) => o.id === dItem.id)) options.push(dItem);
  const patch = (p) => { setDraftErr(''); setDraft((d) => ({ ...d, ...p })); };
  const key = (x) => `${x.itemId}|${x.batchNo.trim()}|${x.expiryDate}`;

  const addToList = () => {
    if (!draft.itemId) return setDraftErr(t('form.errItem'));
    if (!(Number(draft.quantity) > 0)) return setDraftErr(t('form.errQty'));
    if (dItem?.trackExpiry && (!draft.batchNo.trim() || !draft.expiryDate)) return setDraftErr(t('form.errBatch'));
    if (lines.some((x) => key(x) === key(draft))) return setDraftErr(t('form.errDuplicate'));
    setLines([...lines, { ...draft, remarks: shared }]);
    setDraft(emptyLine()); setDraftErr('');
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
      <h2 className="text-base font-semibold">{t('form.itemsReceived')}</h2>
      <Banner>{found.error}</Banner>

      {/* 1. Entry box */}
      <div className="rounded-md border border-line p-4" onKeyDown={onKey}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-semibold">{t('form.addItemTitle')}</h3>
          <input data-search="1" className="input max-w-xs !text-black" placeholder={t('form.searchItems')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label={t('form.item')}>
              <select className="input !text-black" value={draft.itemId} onChange={(ev) => patch({ itemId: ev.target.value, batchNo: '', expiryDate: '' })}>
                <option value="">{t('form.selectItem')}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{t('form.itemOption', { sku: o.sku, name: o.name, qty: qty(o.stock?.quantity), unit: o.unit })}</option>)}
              </select>
            </Field>
          </div>
          <Field label={dItem ? t('form.quantityUnit', { unit: dItem.unit }) : t('form.quantity')}>
            <input className="input !text-black" type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(ev) => patch({ quantity: ev.target.value })} />
          </Field>
          {canCost && (
            <Field label={t('form.unitCost')}><input className="input !text-black" type="number" min="0" step="0.01" value={draft.unitCost} onChange={(ev) => patch({ unitCost: ev.target.value })} /></Field>
          )}
          {dItem?.trackExpiry && (
            <>
              <Field label={t('form.batchNo')}><input className="input !text-black" maxLength={60} value={draft.batchNo} onChange={(ev) => patch({ batchNo: ev.target.value })} /></Field>
              <Field label={t('form.expiryDate')}><input className="input !text-black" type="date" value={draft.expiryDate} onChange={(ev) => patch({ expiryDate: ev.target.value })} /></Field>
            </>
          )}
        </div>
        {draftErr && <p className="mt-3 text-sm text-danger">{draftErr}</p>}
        <div className="mt-4"><button type="button" className="btn-primary gap-2" onClick={addToList}><PlusIcon /> {t('form.addToList')}</button></div>
      </div>

      {/* 2. The list of added items */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('form.listTitle', { count: lines.length })}</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className={`${th} text-center`}>{t('form.no')}</th>
                <th className={th}>{t('form.item')}</th>
                <th className={th}>{t('form.quantity')}</th>
                <th className={th}>{t('form.batchDetails')}</th>
                {canCost && <th className={th}>{t('form.unitCost')}</th>}
                <th className={th}><span className="sr-only">{t('form.edit')}</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td className={`${td} text-center`} colSpan={canCost ? 6 : 5}>{t('form.emptyList')}</td></tr>}
              {lines.map((l, i) => {
                const it = known[l.itemId]; const bad = rowErr(i);
                return (
                  <tr key={`${key(l)}-${i}`} className="bg-white">
                    <td className={`${td} w-10 text-center`}>{i + 1}</td>
                    <td className={td}>{it ? `${it.sku} — ${it.name}` : '…'}{bad && <p className="mt-1 text-xs text-danger">{bad}</p>}</td>
                    <td className={td}>{qty(l.quantity)} {it?.unit || ''}</td>
                    <td className={td}>{it?.trackExpiry ? `${l.batchNo} — ${l.expiryDate}` : <span className="text-slate-400">—</span>}</td>
                    {canCost && <td className={td}>{l.unitCost !== '' && l.unitCost != null ? l.unitCost : <span className="text-slate-400">—</span>}</td>}
                    <td className={`${td} w-24 whitespace-nowrap text-center`}>
                      <button type="button" title={t('form.edit')} aria-label={t('form.edit')} onClick={() => editLine(i)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md transition hover:bg-slate-100"><PencilIcon /></button>
                      <button type="button" title={t('form.removeLine')} aria-label={t('form.removeLine')} onClick={() => remove(i)}
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
      <Field label={t('form.remarksAll')} error={remarksErr ? fe[remarksErr] : undefined}>
        <textarea className="input !text-black" rows={2} maxLength={255} value={shared} onChange={(e) => setShared(e.target.value)} />
      </Field>
    </div>
  );
}

export function HeadFields({ head, setHead, fe, autoRef = false }) {
  const { t } = useTranslation('receiving');
  // Warehouses this user may receive into (a storekeeper: only the ones he is in charge of). A single one is chosen automatically.
  const wh = useLoad(() => warehouseApi.options(), []);
  useEffect(() => { if (wh.data && !head.warehouseId && wh.data.length === 1) setHead({ ...head, warehouseId: wh.data[0].id }); }, [wh.data]); // eslint-disable-line
  const set = (k) => (e) => setHead({ ...head, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.dateReceived')} error={fe.docDate}><input className="input !text-black" type="date" required value={head.docDate} onChange={set('docDate')} /></Field>
      <Field label={t('form.warehouse')} error={fe.warehouseId}>
        <select className="input !text-black" required value={head.warehouseId || ''} onChange={set('warehouseId')}>
          <option value="">{t('form.selectWarehouse')}</option>
          {(wh.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
        </select>
        {wh.data && wh.data.length === 0 && <p className="mt-1 text-xs">{t('form.noWarehouse')}</p>}
      </Field>
      <Field label={t('form.supplier')} error={fe.partyName}><input className="input !text-black" maxLength={150} value={head.partyName} onChange={set('partyName')} /></Field>
      {autoRef ? (
        <Field label={t('form.referenceAuto', { defaultValue: 'Reference no.' })} error={fe.reference}>
          <input className="input !text-black" readOnly disabled value={t('form.referenceAutoHint', { defaultValue: 'Generated automatically when you save' })} />
        </Field>
      ) : (
        <Field label={t('form.reference')} error={fe.reference}><input className="input !text-black" maxLength={100} value={head.reference} onChange={set('reference')} /></Field>
      )}
      <Field label={t('form.notes')} error={fe.reason}><input className="input !text-black" maxLength={1000} value={head.reason} onChange={set('reason')} /></Field>
    </div>
  );
}

export default function ReceivingCreate() {
  const { t } = useTranslation('receiving');
  const docs = useDocText();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [head, setHead] = useState({ docDate: today(), warehouseId: '', partyName: '', reference: '', reason: '' });
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!lines.length) return setErr(t('form.noItems'));
    setBusy(true);
    try {
      // Look up each chosen item so batch fields are sent for items that track expiry.
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (id) => { items[id] = await itemApi.get(id); }));
      const d = await receivingApi.create(buildPayload(head, lines, can('items.view_cost'), items, true));
      // The server posts the stock and generates the reference. Items that track expiry now also show on the Expired list.
      const tracked = lines.some((l) => items[l.itemId]?.trackExpiry);
      navigate('/receiving', { state: { msg: t('receivedSaved', { docNo: d.docNo, reference: d.reference,
        defaultValue: 'Receiving {{docNo}} saved. Reference no. {{reference}}.' }) + (tracked ? ' ' + t('expiryListed', { defaultValue: 'Expiry items are listed on the Expired page.' }) : '') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('newTitle')}</h1>
          <p className="mt-1 text-sm">{t('newSubtitle')}</p>
        </div>
        <Link to="/receiving" className="text-sm hover:underline">{docs.t('backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err}</Banner>
        <HeadFields head={head} setHead={setHead} fe={fe} autoRef />
        <div className="max-w-3xl"><ListLineEditor lines={lines} setLines={setLines} fe={fe} /></div>
        <button className="btn-primary" disabled={busy || !lines.length}>{busy ? t('saving') : t('saveReceiving', { defaultValue: t('saveDraft') })}</button>
      </form>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { itemApi, rejectInApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { TrashIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { qty } from '../stock/StockList.jsx';
import { buildPayload, emptyLine, today } from '../receiving/ReceivingCreate.jsx';

// A customer return always adds stock back, so lines have no direction. buildPayload is shared with Receiving.
export { buildPayload, emptyLine, today };

function LineRow({ l, i, item, options, set, remove, fe, canCost, canRemove }) {
  const { t } = useTranslation('rejectIn');
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
        <Field label={item ? t('form.qtyReturnedUnit', { unit: item.unit }) : t('form.qtyReturned')} error={e('quantity')}>
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

// Shared by RejectInCreate and RejectInUpdate: item search, one editable card per line, and an add-line button.
export function LineEditor({ lines, setLines, fe = {} }) {
  const { t } = useTranslation('rejectIn');
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
        <h2 className="text-base font-semibold">{t('form.itemsReturned')}</h2>
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

export function HeadFields({ head, setHead, fe }) {
  const { t } = useTranslation('rejectIn');
  const set = (k) => (e) => setHead({ ...head, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.dateReturned')} error={fe.docDate}><input className="input !text-black" type="date" required value={head.docDate} onChange={set('docDate')} /></Field>
      <Field label={t('form.party')} error={fe.partyName}><input className="input !text-black" maxLength={150} value={head.partyName} onChange={set('partyName')} /></Field>
      <div className="sm:col-span-2"><Field label={t('form.reference')} error={fe.reference}><input className="input !text-black" maxLength={100} value={head.reference} onChange={set('reference')} /></Field></div>
      <div className="sm:col-span-2"><Field label={t('form.reason')} error={fe.reason}><textarea className="input !text-black" rows={3} required minLength={3} maxLength={1000} value={head.reason} onChange={set('reason')} /></Field></div>
    </div>
  );
}

export default function RejectInCreate() {
  const { t } = useTranslation('rejectIn');
  const { t: td } = useTranslation('docs');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [head, setHead] = useState({ docDate: today(), partyName: '', reference: '', reason: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      // Look up each chosen item so batch fields are sent for items that track expiry.
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (id) => { items[id] = await itemApi.get(id); }));
      const d = await rejectInApi.create(buildPayload(head, lines, can('items.view_cost'), items));
      navigate('/reject-in', { state: { msg: t('create.draftSaved', { docNo: d.docNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/reject-in" className="text-sm hover:underline">{td('backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err}</Banner>
        <HeadFields head={head} setHead={setHead} fe={fe} />
        <div className="max-w-3xl"><LineEditor lines={lines} setLines={setLines} fe={fe} /></div>
        <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('create.saveDraft')}</button>
      </form>
    </div>
  );
}

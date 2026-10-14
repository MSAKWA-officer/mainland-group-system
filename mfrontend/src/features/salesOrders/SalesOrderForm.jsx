import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { customerApi, itemApi, salespersonApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Field from '../../components/Field.jsx';
import { PlusIcon, TrashIcon, XIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { METHOD } from '../sales/saleUi.jsx';
import { money } from './SalesOrdersList.jsx';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let seq = 0;
const key = () => { seq += 1; return `l${seq}`; };
export const blankLine = () => ({ key: key(), item: null, quantity: '1', unitPrice: '', discountPercent: '0' });
// saleType starts empty on purpose: the salesperson must choose Cash or Credit, so an order never lands on the wrong page by default.
export const EMPTY = () => ({ saleType: '', customer: null, salespersonId: '', orderDate: today(), deliveryDate: '', dueDate: '', paymentMethod: 'CASH', paymentReference: '',
  taxRate: '0', notes: '', lines: [blankLine()] });

// Turns a saved order (from the API) into form state.
export const fromOrder = (o) => ({
  saleType: o.saleType || '',
  customer: o.customer ? { id: o.customer.id, code: o.customer.code, name: o.customer.name, paymentTermsDays: o.customer.paymentTermsDays } : null,
  salespersonId: o.salespersonId || '', orderDate: o.orderDate || today(), deliveryDate: o.deliveryDate || '', dueDate: o.dueDate || '',
  paymentMethod: o.paymentMethod || 'CASH', paymentReference: o.paymentReference || '', taxRate: String(Number(o.taxRate ?? 0)), notes: o.notes || '',
  lines: (o.lines || []).map((l) => ({ key: key(), item: { id: l.itemId, sku: l.sku, name: l.itemName, unit: l.unit, sellingPrice: l.unitPrice },
    quantity: String(Number(l.quantity)), unitPrice: String(Number(l.unitPrice)), discountPercent: String(Number(l.discountPercent)) })),
});

// Estimated amounts for the screen only. The server calculates the real totals when the order is saved.
const n = (v) => Number(v) || 0;
const lineNet = (l) => Math.round(Math.round(n(l.quantity) * 1000) * Math.round(n(l.unitPrice) * 100) * (10000 - Math.round(n(l.discountPercent) * 100)) / 1e7) / 100;
const lineGross = (l) => Math.round(Math.round(n(l.quantity) * 1000) * Math.round(n(l.unitPrice) * 100) / 1000) / 100;
export const estimate = (f) => {
  const gross = f.lines.reduce((a, l) => a + lineGross(l), 0); const net = f.lines.reduce((a, l) => a + lineNet(l), 0);
  const tax = Math.round(net * n(f.taxRate)) / 100;
  return { gross, discount: gross - net, tax, total: net + tax };
};

// Form -> API body. Prices and discounts are only sent for users who may set them; everyone else gets the catalogue price from the server.
// Cash orders send the payment method; credit orders send the due date (empty = the server uses today + the customer's payment terms).
export const toBody = (f, { canSetPrice, canPickSalesperson }) => ({
  saleType: f.saleType,
  customerId: f.customer.id,
  ...(canPickSalesperson && f.salespersonId && { salespersonId: f.salespersonId }),
  orderDate: f.orderDate || undefined, deliveryDate: f.deliveryDate || null, notes: f.notes.trim() || null, taxRate: n(f.taxRate),
  ...(f.saleType === 'CREDIT' ? { dueDate: f.dueDate || null } : { paymentMethod: f.paymentMethod || 'CASH', paymentReference: f.paymentReference.trim() || null }),
  lines: f.lines.map((l) => ({ itemId: l.item.id, quantity: n(l.quantity), ...(canSetPrice && { unitPrice: n(l.unitPrice), discountPercent: n(l.discountPercent) }) })),
});
// Client-side checks (the API checks everything again). `t` is the translate function of the 'salesOrders' namespace.
// Returns a message or ''.
export const problem = (f, t) => {
  if (!['CASH', 'CREDIT'].includes(f.saleType)) return t('problems.chooseSaleType');
  if (!f.customer) return t('problems.chooseCustomer');
  if (!f.lines.length || f.lines.some((l) => !l.item)) return t('problems.lineNeedsItem');
  if (f.lines.some((l) => !(n(l.quantity) > 0))) return t('problems.qtyPositive');
  const ids = f.lines.map((l) => l.item.id);
  if (new Set(ids).size !== ids.length) return t('problems.itemTwice');
  if (f.deliveryDate && f.orderDate && f.deliveryDate < f.orderDate) return t('problems.deliveryBeforeOrder');
  if (f.saleType === 'CREDIT' && f.dueDate && f.orderDate && f.dueDate < f.orderDate) return t('problems.dueBeforeOrder');
  if (!(estimate(f).total > 0)) return t('problems.totalPositive');
  return '';
};

// Search box that shows matching records in a dropdown. `value` is the picked record (or null).
function Lookup({ label, value, onPick, search, show, render, placeholder, error }) {
  const { t } = useTranslation('salesOrders');
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const timer = setTimeout(() => { setBusy(true); search(q.trim()).then((r) => live && setRows(r), () => live && setRows([])).finally(() => live && setBusy(false)); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q, open]); // eslint-disable-line
  return (
    <Field label={label} error={error}>
      {value ? (
        <div className="input flex items-center justify-between gap-2">
          <span className="truncate text-black">{show(value)}</span>
          <button type="button" title={t('form.change')} aria-label={t('form.changeAria', { label })} onClick={() => { onPick(null); setQ(''); }} className="text-slate-600 hover:text-black"><XIcon width={16} height={16} /></button>
        </div>
      ) : (
        <div className="relative">
          <input className="input" placeholder={placeholder} aria-label={label} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-white shadow-lg">
              {busy && <li className="px-3 py-2 text-sm text-black">{t('form.searching')}</li>}
              {!busy && rows.length === 0 && <li className="px-3 py-2 text-sm text-black">{t('form.noResults')}</li>}
              {rows.map((r) => (
                <li key={r.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); onPick(r); setOpen(false); setQ(''); }} className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-slate-100">{render(r)}</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

const searchCustomers = (q) => customerApi.list({ ...(q && { search: q }), isActive: 'true', limit: 10 }).then((r) => r.data);
const searchItems = (q) => itemApi.list({ ...(q && { search: q }), isActive: 'true', limit: 10 }).then((r) => r.data);

const LINE_HEADS = ['item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal'];
const TYPES = [['CASH', 'cash'], ['CREDIT', 'credit']];

// Two big radio cards: Cash sale / Credit sale.
function SaleTypePicker({ value, onChange, error }) {
  const { t } = useTranslation('salesOrders');
  return (
    <fieldset className="sm:col-span-2">
      <legend className="label">{t('form.saleType')}</legend>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('form.saleType')}>
        {TYPES.map(([code, k]) => {
          const on = value === code;
          return (
            <label key={code} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-black transition ${on ? 'border-brand bg-emerald-50 ring-1 ring-brand' : 'border-line bg-white hover:bg-slate-50'}`}>
              <input type="radio" name="saleType" className="mt-1" value={code} checked={on} onChange={() => onChange(code)} />
              <span><span className="block text-sm font-semibold">{t(`form.${k}`)}</span><span className="block text-xs">{t(`form.${k}Help`)}</span></span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </fieldset>
  );
}

// Form fields shared by SalesOrdersCreate and SalesOrdersUpdate: sale type, header, line items and estimated totals.
export default function SalesOrderForm({ f, setF, fe }) {
  const { t } = useTranslation('salesOrders');
  const { can } = useAuth();
  const canSetPrice = can('sales_orders.set_price');
  const canPick = can('sales_orders.read_all') && can('salespersons.read');
  const sps = useLoad(() => (canPick ? salespersonApi.list({ isActive: 'true', limit: 100 }) : Promise.resolve(null)), [canPick]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, x) => (x === i ? { ...l, ...patch } : l)) });
  const pickItem = (i, it) => setLine(i, it ? { item: { id: it.id, sku: it.sku, name: it.name, unit: it.unit, sellingPrice: it.sellingPrice }, unitPrice: String(Number(it.sellingPrice)) } : { item: null, unitPrice: '' });
  const est = estimate(f);
  const terms = f.customer?.paymentTermsDays;
  return (
    <div className="space-y-6">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <SaleTypePicker value={f.saleType} onChange={(saleType) => setF({ ...f, saleType })} error={fe.saleType} />
        <Lookup label={t('form.customer')} value={f.customer} placeholder={t('form.customerPlaceholder')} error={fe.customerId} search={searchCustomers}
          show={(c) => `${c.name} (${c.code})`} render={(c) => <>{c.name} <span className="text-xs">{c.code}{c.phone ? ` · ${c.phone}` : ''}</span></>}
          onPick={(c) => setF({ ...f, customer: c, salespersonId: c?.salespersonId || f.salespersonId })} />
        {canPick ? (
          <Field label={t('form.salesperson')} error={fe.salespersonId}>
            <select className="input" value={f.salespersonId} onChange={set('salespersonId')}>
              <option value="">{t('form.customerSalesperson')}</option>
              {(sps.data?.data || []).map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.code})</option>)}
            </select>
          </Field>
        ) : <p className="self-end pb-2 text-sm text-black">{t('form.createdForYou')}</p>}
        <Field label={t('form.orderDate')} error={fe.orderDate}><input className="input" type="date" required value={f.orderDate} onChange={set('orderDate')} /></Field>
        <Field label={t('form.deliveryDate')} error={fe.deliveryDate}><input className="input" type="date" min={f.orderDate || undefined} value={f.deliveryDate} onChange={set('deliveryDate')} /></Field>
        {f.saleType === 'CASH' && (<>
          <Field label={t('form.paymentMethod')} error={fe.paymentMethod}>
            <select className="input" value={f.paymentMethod} onChange={set('paymentMethod')}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label={t('form.paymentReference')} error={fe.paymentReference}><input className="input" maxLength={100} value={f.paymentReference} onChange={set('paymentReference')} /></Field>
        </>)}
        {f.saleType === 'CREDIT' && (
          <div>
            <Field label={t('form.dueDate')} error={fe.dueDate}><input className="input" type="date" min={f.orderDate || undefined} value={f.dueDate} onChange={set('dueDate')} /></Field>
            <p className="mt-1 text-xs text-black">{terms != null ? t('form.dueAuto', { count: Number(terms) }) : t('form.dueAutoNoCustomer')}</p>
          </div>
        )}
        <Field label={t('form.taxRate')} error={fe.taxRate}><input className="input" type="number" min="0" max="100" step="0.01" value={f.taxRate} onChange={set('taxRate')} /></Field>
        <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={2} maxLength={2000} value={f.notes} onChange={set('notes')} /></Field></div>
        {f.saleType && <p className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs text-black sm:col-span-2">{t(`form.flow${f.saleType}`)}</p>}
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold text-black">{t('form.items')}</h2>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[44rem]">
            <thead className="bg-slate-50"><tr>{[...LINE_HEADS.map((k) => t(`lines.${k}`)), ''].map((h, i) => <th key={i} className="th px-3 py-2 font-normal uppercase text-black">{h}</th>)}</tr></thead>
            <tbody>
              {f.lines.map((l, i) => {
                const err = fe[`lines.${i}.itemId`] || fe[`lines.${i}.quantity`] || fe[`lines.${i}.unitPrice`] || fe[`lines.${i}.discountPercent`];
                return (
                  <tr key={l.key} className="align-top">
                    <td className="td w-[40%] px-3">
                      <Lookup label={t('form.itemLabel', { n: i + 1 })} value={l.item} placeholder={t('form.itemPlaceholder')} search={searchItems}
                        show={(it) => `${it.name} (${it.sku})`} onPick={(it) => pickItem(i, it)}
                        render={(it) => <>{it.name} <span className="text-xs">{it.sku} · {t('form.inStock', { qty: Number(it.stock?.quantity ?? 0), unit: it.unit })}</span></>} />
                      {err && <p className="mt-1 text-xs text-black">{err}</p>}
                    </td>
                    <td className="td px-3"><div className="flex items-center gap-1"><input className="input w-24" type="number" min="0" step="0.001" aria-label={t('form.quantityAria', { n: i + 1 })} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /><span className="text-xs text-black">{l.item?.unit}</span></div></td>
                    <td className="td px-3"><input className="input w-28 read-only:bg-slate-50" type="number" min="0" step="0.01" aria-label={t('form.unitPriceAria', { n: i + 1 })} readOnly={!canSetPrice} title={canSetPrice ? undefined : t('form.priceFromCatalogue')} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                    <td className="td px-3"><input className="input w-20 read-only:bg-slate-50" type="number" min="0" max="100" step="0.01" aria-label={t('form.discountAria', { n: i + 1 })} readOnly={!canSetPrice} title={canSetPrice ? undefined : t('form.noDiscountAllowed')} value={l.discountPercent} onChange={(e) => setLine(i, { discountPercent: e.target.value })} /></td>
                    <td className="td whitespace-nowrap px-3 text-right text-black">{money(lineNet(l))}</td>
                    <td className="td px-3">
                      <button type="button" title={t('form.removeLine')} aria-label={t('form.removeLineAria', { n: i + 1 })} disabled={f.lines.length === 1} onClick={() => setF({ ...f, lines: f.lines.filter((_, x) => x !== i) })}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"><TrashIcon /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {fe.lines && <p className="mt-1 text-xs text-black">{fe.lines}</p>}
        <button type="button" onClick={() => setF({ ...f, lines: [...f.lines, blankLine()] })} className="mt-3 inline-flex items-center gap-2 rounded-md border border-brand/40 px-3 py-1.5 text-sm font-medium text-brand hover:bg-emerald-50"><PlusIcon width={16} height={16} />{t('form.addItem')}</button>
      </div>

      <dl className="ml-auto max-w-xs space-y-1 text-sm text-black">
        <div className="flex justify-between"><dt>{t('totals.subtotal')}</dt><dd>{money(est.gross)}</dd></div>
        <div className="flex justify-between"><dt>{t('totals.discount')}</dt><dd>{money(est.discount)}</dd></div>
        <div className="flex justify-between"><dt>{t('totals.tax', { rate: n(f.taxRate) })}</dt><dd>{money(est.tax)}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>{t('totals.total')}</dt><dd>{money(est.total)}</dd></div>
        <p className="pt-1 text-xs">{t('form.estimateNote')}</p>
      </dl>
    </div>
  );
}

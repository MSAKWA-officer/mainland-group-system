import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { customerApi, itemApi } from '../../api/index.js';
import Field from '../../components/Field.jsx';
import { PlusIcon, TrashIcon, XIcon } from '../../components/Icons.jsx';
import i18n from '../../i18n';
import { money } from './saleUi.jsx';

// Form pieces shared by the Cash sale and Credit sale screens: record lookup, line items table and estimated totals.
// Texts come from locales/<lang>/saleForm.json (namespace 'saleForm').
let seq = 0;
export const blankLine = () => { seq += 1; return { key: `l${seq}`, item: null, quantity: '1', unitPrice: '', discountPercent: '0' }; };

// Estimated amounts for the screen only. The server calculates the real totals when the sale is saved.
export const n = (v) => Number(v) || 0;
export const lineNet = (l) => Math.round(Math.round(n(l.quantity) * 1000) * Math.round(n(l.unitPrice) * 100) * (10000 - Math.round(n(l.discountPercent) * 100)) / 1e7) / 100;
const lineGross = (l) => Math.round(Math.round(n(l.quantity) * 1000) * Math.round(n(l.unitPrice) * 100) / 1000) / 100;
export const estimate = (f) => {
  const gross = f.lines.reduce((a, l) => a + lineGross(l), 0); const net = f.lines.reduce((a, l) => a + lineNet(l), 0);
  const tax = Math.round(net * n(f.taxRate)) / 100;
  return { gross, discount: gross - net, tax, total: Math.round((net + tax) * 100) / 100 };
};
const tp = (k) => i18n.t(`problem.${k}`, { ns: 'saleForm' });
export const linesProblem = (f) => {
  if (!f.lines.length || f.lines.some((l) => !l.item)) return tp('lineNeedsItem');
  if (f.lines.some((l) => !(n(l.quantity) > 0))) return tp('qtyPositive');
  if (f.lines.some((l) => !(n(l.unitPrice) > 0))) return tp('pricePositive');
  const ids = f.lines.map((l) => l.item.id);
  if (new Set(ids).size !== ids.length) return tp('duplicateItem');
  return '';
};
// Prices and discounts are only sent for users who may set them; everyone else gets the catalogue price from the server.
export const linesBody = (f, canSetPrice) =>
  f.lines.map((l) => ({ itemId: l.item.id, quantity: n(l.quantity), ...(canSetPrice && { unitPrice: n(l.unitPrice), discountPercent: n(l.discountPercent) }) }));

export const searchCustomers = (q) => customerApi.list({ ...(q && { search: q }), isActive: 'true', limit: 10 }).then((r) => r.data);
const searchItems = (q) => itemApi.list({ ...(q && { search: q }), isActive: 'true', limit: 10 }).then((r) => r.data);

// Search box that shows matching records in a dropdown. `value` is the picked record (or null).
export function Lookup({ label, value, onPick, search, show, render, placeholder, error }) {
  const { t } = useTranslation('saleForm');
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const x = setTimeout(() => { setBusy(true); search(q.trim()).then((r) => live && setRows(r), () => live && setRows([])).finally(() => live && setBusy(false)); }, 250);
    return () => { live = false; clearTimeout(x); };
  }, [q, open]); // eslint-disable-line
  return (
    <Field label={label} error={error}>
      {value ? (
        <div className="input flex items-center justify-between gap-2">
          <span className="truncate text-black">{show(value)}</span>
          <button type="button" title={t('change')} aria-label={t('changeLabel', { label })} onClick={() => { onPick(null); setQ(''); }} className="text-slate-600 hover:text-black"><XIcon width={16} height={16} /></button>
        </div>
      ) : (
        <div className="relative">
          <input className="input" placeholder={placeholder} aria-label={label} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-white shadow-lg">
              {busy && <li className="px-3 py-2 text-sm text-black">{t('searching')}</li>}
              {!busy && rows.length === 0 && <li className="px-3 py-2 text-sm text-black">{t('noResults')}</li>}
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

// Line items table + estimated totals. `f.lines` and `f.taxRate` are read; `setF` receives the updated form.
export function SaleLines({ f, setF, fe, canSetPrice }) {
  const { t } = useTranslation('saleForm');
  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, x) => (x === i ? { ...l, ...patch } : l)) });
  const pickItem = (i, it) => setLine(i, it ? { item: { id: it.id, sku: it.sku, name: it.name, unit: it.unit, sellingPrice: it.sellingPrice }, unitPrice: String(Number(it.sellingPrice)) } : { item: null, unitPrice: '' });
  const est = estimate(f);
  const heads = ['item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal', ''];
  return (
    <>
      <div>
        <h2 className="mb-2 text-base font-semibold text-black">{t('items')}</h2>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[44rem]">
            <thead className="bg-slate-50"><tr>{heads.map((h, i) => <th key={i} className="th px-3 py-2 font-normal uppercase text-black">{h && t(h)}</th>)}</tr></thead>
            <tbody>
              {f.lines.map((l, i) => {
                const err = fe[`lines.${i}.itemId`] || fe[`lines.${i}.quantity`] || fe[`lines.${i}.unitPrice`] || fe[`lines.${i}.discountPercent`];
                return (
                  <tr key={l.key} className="align-top">
                    <td className="td w-[40%] px-3">
                      <Lookup label={t('itemN', { n: i + 1 })} value={l.item} placeholder={t('searchItem')} search={searchItems}
                        show={(it) => `${it.name} (${it.sku})`} onPick={(it) => pickItem(i, it)}
                        render={(it) => <>{it.name} <span className="text-xs">{t('inStock', { sku: it.sku, qty: Number(it.stock?.quantity ?? 0), unit: it.unit })}</span></>} />
                      {err && <p className="mt-1 text-xs text-black">{err}</p>}
                    </td>
                    <td className="td px-3"><div className="flex items-center gap-1"><input className="input w-24" type="number" min="0" step="0.001" aria-label={t('quantityN', { n: i + 1 })} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /><span className="text-xs text-black">{l.item?.unit}</span></div></td>
                    <td className="td px-3"><input className="input w-28 read-only:bg-slate-50" type="number" min="0" step="0.01" aria-label={t('unitPriceN', { n: i + 1 })} readOnly={!canSetPrice} title={canSetPrice ? undefined : t('priceFromCatalogue')} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                    <td className="td px-3"><input className="input w-20 read-only:bg-slate-50" type="number" min="0" max="100" step="0.01" aria-label={t('discountN', { n: i + 1 })} readOnly={!canSetPrice} title={canSetPrice ? undefined : t('noDiscountAllowed')} value={l.discountPercent} onChange={(e) => setLine(i, { discountPercent: e.target.value })} /></td>
                    <td className="td whitespace-nowrap px-3 text-right text-black">{money(lineNet(l))}</td>
                    <td className="td px-3">
                      <button type="button" title={t('removeLine')} aria-label={t('removeLineN', { n: i + 1 })} disabled={f.lines.length === 1} onClick={() => setF({ ...f, lines: f.lines.filter((_, x) => x !== i) })}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"><TrashIcon /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {fe.lines && <p className="mt-1 text-xs text-black">{fe.lines}</p>}
        <button type="button" onClick={() => setF({ ...f, lines: [...f.lines, blankLine()] })} className="mt-3 inline-flex items-center gap-2 rounded-md border border-brand/40 px-3 py-1.5 text-sm font-medium text-brand hover:bg-emerald-50"><PlusIcon width={16} height={16} />{t('addItem')}</button>
      </div>
      <dl className="ml-auto max-w-xs space-y-1 text-sm text-black">
        <div className="flex justify-between"><dt>{t('subtotal')}</dt><dd>{money(est.gross)}</dd></div>
        <div className="flex justify-between"><dt>{t('discount')}</dt><dd>{money(est.discount)}</dd></div>
        <div className="flex justify-between"><dt>{t('tax', { rate: n(f.taxRate) })}</dt><dd>{money(est.tax)}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>{t('total')}</dt><dd>{money(est.total)}</dd></div>
        <p className="pt-1 text-xs">{t('estimateOnly')}</p>
      </dl>
    </>
  );
}

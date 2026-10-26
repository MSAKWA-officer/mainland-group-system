import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { itemApi } from '../../api/index.js';
import Field from '../../components/Field.jsx';
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons.jsx';
import { Lookup, blankLine, estimate, lineNet, n } from './saleForm.jsx';
import { money } from './saleUi.jsx';

// Chagua bidhaa -> jaza kiasi/bei/punguzo -> "Ongeza" -> inaingia kwenye jedwali la chini, na jumla ya bidhaa zote zilizochaguliwa inaonekana chini yake.
// Inatumia umbo lile lile la `f.lines` / `f.taxRate`, kwa hiyo estimate(), linesProblem() na linesBody() za saleForm.jsx zinafanya kazi kama kawaida.
// Texts: locales/<lang>/saleEntry.json (namespace 'saleEntry').
const searchItems = (q) => itemApi.list({ ...(q && { search: q }), isActive: 'true', limit: 10 }).then((r) => r.data);
const BLANK = { item: null, quantity: '1', unitPrice: '', discountPercent: '0' };
const r3 = (v) => Math.round(v * 1000) / 1000;

export default function SaleItemsEntry({ f, setF, fe = {}, canSetPrice }) {
  const { t } = useTranslation('saleEntry');
  const [e, setE] = useState(BLANK);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const patch = (p) => { setMsg({ kind: '', text: '' }); setE({ ...e, ...p }); };
  const pick = (it) => patch(it
    ? { item: { id: it.id, sku: it.sku, name: it.name, unit: it.unit, sellingPrice: it.sellingPrice, stockQty: Number(it.stock?.quantity ?? 0) }, unitPrice: String(Number(it.sellingPrice)) }
    : { item: null, unitPrice: '' });

  const add = () => {
    const fail = (k) => setMsg({ kind: 'err', text: t(k) });
    if (!e.item) return fail('errPickItem');
    if (!(n(e.quantity) > 0)) return fail('errQty');
    if (!(n(e.unitPrice) > 0)) return fail('errPrice');
    if (n(e.discountPercent) < 0 || n(e.discountPercent) > 100) return fail('errDiscount');
    const fresh = { ...blankLine(), item: e.item, quantity: String(n(e.quantity)), unitPrice: String(n(e.unitPrice)), discountPercent: String(n(e.discountPercent)) };
    const at = f.lines.findIndex((l) => l.item.id === e.item.id);
    if (at >= 0) {            // bidhaa ileile haiwekwi mara mbili: kiasi kinaongezwa kwenye mstari uliopo
      setF({ ...f, lines: f.lines.map((l, i) => (i === at ? { ...fresh, key: l.key, quantity: String(r3(n(l.quantity) + n(e.quantity))) } : l)) });
      setMsg({ kind: 'ok', text: t('merged', { name: e.item.name }) });
    } else {
      setF({ ...f, lines: [...f.lines, fresh] });
      setMsg({ kind: 'ok', text: t('added', { name: e.item.name }) });
    }
    setE(BLANK);
  };
  const edit = (i) => { const l = f.lines[i]; setE({ item: l.item, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent }); setF({ ...f, lines: f.lines.filter((_, x) => x !== i) }); setMsg({ kind: '', text: '' }); };
  const remove = (i) => setF({ ...f, lines: f.lines.filter((_, x) => x !== i) });
  const onEnter = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } };   // Enter isihifadhi fomu nzima

  const est = estimate(f);
  const heads = ['no', 'item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal', ''];
  const low = e.item && n(e.quantity) > e.item.stockQty;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-base font-semibold text-black">{t('pickTitle')}</h2>
        <div className="grid items-start gap-3 rounded-md border border-line p-4 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <Lookup label={t('item')} value={e.item} placeholder={t('searchItem')} search={searchItems} show={(it) => `${it.name} (${it.sku})`} onPick={pick}
              render={(it) => <>{it.name} <span className="text-xs">{t('inStock', { sku: it.sku, qty: Number(it.stock?.quantity ?? 0), unit: it.unit })}</span></>} />
          </div>
          <div className="sm:col-span-2">
            <Field label={t('quantity')}><div className="flex items-center gap-1"><input className="input w-full" type="number" min="0" step="0.001" value={e.quantity} onKeyDown={onEnter} onChange={(x) => patch({ quantity: x.target.value })} /><span className="text-xs text-black">{e.item?.unit}</span></div></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('unitPrice')}><input className="input w-full read-only:bg-slate-50" type="number" min="0" step="0.01" readOnly={!canSetPrice} title={canSetPrice ? undefined : t('priceFromCatalogue')} value={e.unitPrice} onKeyDown={onEnter} onChange={(x) => patch({ unitPrice: x.target.value })} /></Field>
          </div>
          <div className="sm:col-span-1">
            <Field label={t('discountPercent')}><input className="input w-full read-only:bg-slate-50" type="number" min="0" max="100" step="0.01" readOnly={!canSetPrice} title={canSetPrice ? undefined : t('noDiscountAllowed')} value={e.discountPercent} onKeyDown={onEnter} onChange={(x) => patch({ discountPercent: x.target.value })} /></Field>
          </div>
          <div className="self-end sm:col-span-2">
            <button type="button" onClick={add} className="btn-primary inline-flex w-full items-center justify-center gap-2"><PlusIcon width={16} height={16} />{t('add')}</button>
          </div>
          {e.item && <p className="text-sm text-black sm:col-span-12">{t('lineTotalNow')} <b>{money(lineNet({ ...e }))}</b>{low && <span className="ml-3 text-xs">{t('lowStock', { qty: e.item.stockQty, unit: e.item.unit })}</span>}</p>}
          {msg.text && <p role="status" className={`text-sm sm:col-span-12 ${msg.kind === 'err' ? 'font-medium text-red-700' : 'text-emerald-700'}`}>{msg.text}</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold text-black">{t('listTitle', { count: f.lines.length })}</h2>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[44rem]">
            <thead className="bg-slate-50"><tr>{heads.map((h, i) => <th key={i} className="th px-3 py-2 font-normal uppercase text-black">{h && t(h)}</th>)}</tr></thead>
            <tbody>
              {f.lines.length === 0 && <tr><td className="td px-3 py-4 text-center text-sm text-black" colSpan={heads.length}>{t('empty')}</td></tr>}
              {f.lines.map((l, i) => {
                const err = fe[`lines.${i}.itemId`] || fe[`lines.${i}.quantity`] || fe[`lines.${i}.unitPrice`] || fe[`lines.${i}.discountPercent`];
                return (
                  <tr key={l.key} className="align-top odd:bg-slate-50/60">
                    <td className="td px-3 text-black">{i + 1}</td>
                    <td className="td px-3 text-black">{l.item.name}<div className="text-xs">{l.item.sku}</div>{err && <p className="mt-1 text-xs">{err}</p>}</td>
                    <td className="td whitespace-nowrap px-3 text-black">{n(l.quantity)} {l.item.unit}</td>
                    <td className="td whitespace-nowrap px-3 text-right text-black">{money(n(l.unitPrice))}</td>
                    <td className="td px-3 text-right text-black">{n(l.discountPercent)}</td>
                    <td className="td whitespace-nowrap px-3 text-right text-black">{money(lineNet(l))}</td>
                    <td className="td px-3">
                      <div className="flex gap-2">
                        <button type="button" title={t('editLine')} aria-label={t('editLineN', { n: i + 1 })} onClick={() => edit(i)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><PencilIcon /></button>
                        <button type="button" title={t('removeLine')} aria-label={t('removeLineN', { n: i + 1 })} onClick={() => remove(i)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {fe.lines && <p className="mt-1 text-xs text-black">{fe.lines}</p>}
      </div>

      <dl className="ml-auto max-w-xs space-y-1 text-sm text-black">
        <div className="flex justify-between"><dt>{t('selectedItems')}</dt><dd><b>{f.lines.length}</b></dd></div>
        <div className="flex justify-between"><dt>{t('subtotal')}</dt><dd>{money(est.gross)}</dd></div>
        <div className="flex justify-between"><dt>{t('discount')}</dt><dd>{money(est.discount)}</dd></div>
        <div className="flex justify-between"><dt>{t('tax', { rate: n(f.taxRate) })}</dt><dd>{money(est.tax)}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>{t('total')}</dt><dd>{money(est.total)}</dd></div>
        <p className="pt-1 text-xs">{t('estimateOnly')}</p>
      </dl>
    </div>
  );
}

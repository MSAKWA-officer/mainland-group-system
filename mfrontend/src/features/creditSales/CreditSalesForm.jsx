import { useTranslation } from 'react-i18next';
import { salespersonApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Field from '../../components/Field.jsx';
import i18n from '../../i18n';
import useLoad from '../../utils/useLoad';
import { Lookup, SaleLines, blankLine, estimate, linesBody, linesProblem, n, searchCustomers } from '../sales/saleForm.jsx';
import SaleItemsEntry from '../sales/SaleItemsEntry.jsx';
import CreditStatus from './CreditStatus.jsx';

export const EMPTY = () => ({ customer: null, salespersonId: '', dueDate: '', taxRate: '0', notes: '', lines: [blankLine()] });

// Turns a saved sale (from the API) into form state.
let k = 0;
export const fromSale = (s) => ({
  customer: s.customer ? { id: s.customer.id, code: s.customer.code, name: s.customer.name } : null,
  salespersonId: s.salespersonId || '', dueDate: s.dueDate || '', taxRate: String(Number(s.taxRate ?? 0)), notes: s.notes || '',
  lines: (s.lines || []).map((l) => { k += 1; return { key: `e${k}`, item: { id: l.itemId, sku: l.sku, name: l.itemName, unit: l.unit, sellingPrice: l.unitPrice },
    quantity: String(Number(l.quantity)), unitPrice: String(Number(l.unitPrice)), discountPercent: String(Number(l.discountPercent)) }; }),
});
export const toBody = (f, { canSetPrice, canPickSalesperson }) => ({
  customerId: f.customer.id,
  ...(canPickSalesperson && f.salespersonId && { salespersonId: f.salespersonId }),
  ...(f.dueDate && { dueDate: f.dueDate }),                       // empty = the server uses the customer's payment terms
  notes: f.notes.trim() || null, taxRate: n(f.taxRate), lines: linesBody(f, canSetPrice),
});
const te = (key) => i18n.t(`form.${key}`, { ns: 'creditSales' });
export const problem = (f, today) => {
  if (!f.customer) return te('errCustomer');
  const p = linesProblem(f); if (p) return p;
  if (!(estimate(f).total > 0)) return te('errTotal');
  if (f.dueDate && f.dueDate < today) return te('errDuePast');
  return '';
};
export const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Form fields shared by CreditSalesCreate and CreditSalesUpdate.
// entry = true (CreditSalesCreate): bidhaa huchaguliwa kisha kuongezwa kwenye jedwali. Vinginevyo (CreditSalesUpdate): jedwali la kuhariri kama kawaida.
export default function CreditSalesForm({ f, setF, fe, entry = false }) {
  const { t } = useTranslation('creditSales');
  const { can } = useAuth();
  const canSetPrice = can('credit_sales.set_price');
  const canPick = can('credit_sales.read_all') && can('salespersons.read');
  const sps = useLoad(() => (canPick ? salespersonApi.list({ isActive: 'true', limit: 100 }) : Promise.resolve(null)), [canPick]);
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  return (
    <div className="space-y-6">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Lookup label={t('form.customer')} value={f.customer} placeholder={t('form.customerPh')} error={fe.customerId} search={searchCustomers}
          show={(c) => `${c.name} (${c.code})`} render={(c) => <>{c.name} <span className="text-xs">{c.code}{c.phone ? ` · ${c.phone}` : ''}</span></>}
          onPick={(c) => setF({ ...f, customer: c, dueDate: '', salespersonId: c?.salespersonId || f.salespersonId })} />
        {canPick ? (
          <Field label={t('form.salesperson')} error={fe.salespersonId}>
            <select className="input" value={f.salespersonId} onChange={set('salespersonId')}>
              <option value="">{t('form.customersSalesperson')}</option>
              {(sps.data?.data || []).map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.code})</option>)}
            </select>
          </Field>
        ) : <p className="self-end pb-2 text-sm text-black">{t('form.createdForYou')}</p>}
        {f.customer && <div className="sm:col-span-2"><CreditStatus customerId={f.customer.id} total={estimate(f).total} /></div>}
        <Field label={t('form.dueDate')} error={fe.dueDate}>
          <input className="input" type="date" min={todayStr()} value={f.dueDate} onChange={set('dueDate')} />
          <p className="mt-1 text-xs text-black">{t('form.dueHint')}</p>
        </Field>
        <Field label={t('form.taxRate')} error={fe.taxRate}><input className="input" type="number" min="0" max="100" step="0.01" value={f.taxRate} onChange={set('taxRate')} /></Field>
        <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={2} maxLength={2000} value={f.notes} onChange={set('notes')} /></Field></div>
      </div>
      {entry ? <SaleItemsEntry f={f} setF={setF} fe={fe} canSetPrice={canSetPrice} /> : <SaleLines f={f} setF={setF} fe={fe} canSetPrice={canSetPrice} />}
    </div>
  );
}

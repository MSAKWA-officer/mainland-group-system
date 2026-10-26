import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { cashSaleApi, errMsg, fieldErrs, salespersonApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { Lookup, estimate, linesBody, linesProblem, n, searchCustomers } from '../sales/saleForm.jsx';
import SaleItemsEntry from '../sales/SaleItemsEntry.jsx';
import { MAX_PROVIDER, MAX_REF, OTHER, PROVIDER_KIND, joinReference, providerList } from '../sales/paymentProviders.js';
import { METHOD, NOTICE, money } from '../sales/saleUi.jsx';

// lines huanza tupu: bidhaa zinaongezwa kupitia SaleItemsEntry. provider = benki/mtandao uliochaguliwa (au OTHER + providerOther).
const EMPTY = () => ({ customer: null, walkInName: '', walkInPhone: '', salespersonId: '', taxRate: '0', notes: '', lines: [], method: 'CASH', tendered: '', reference: '', provider: '', providerOther: '' });

// Counter sale: pick items, take the payment, save. The sale is completed and the stock is issued in one step (no draft, no approval).
export default function CashSalesCreate() {
  const { t } = useTranslation('cashSales');
  const { t: te } = useTranslation('saleEntry');
  const navigate = useNavigate();
  const { can } = useAuth();
  const canSetPrice = can('cash_sales.set_price');
  const canPick = can('cash_sales.read_all') && can('salespersons.read');
  const sps = useLoad(() => (canPick ? salespersonApi.list({ isActive: 'true', limit: 100 }) : Promise.resolve(null)), [canPick]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setMethod = (e) => setF({ ...f, method: e.target.value, provider: '', providerOther: '' });   // benki/mtandao huchaguliwa upya njia ikibadilika
  const est = estimate(f);
  const cashPay = f.method === 'CASH';
  const kind = PROVIDER_KIND[f.method];                       // 'bank' | 'network' | undefined
  const providers = providerList(f.method);
  const providerName = f.provider === OTHER ? f.providerOther.trim() : f.provider;
  const tendered = f.tendered === '' ? est.total : n(f.tendered);
  const change = Math.round((tendered - est.total) * 100) / 100;

  const problem = () => {
    if (!f.lines.length) return te('errNoItems');
    const p = linesProblem(f); if (p) return p;
    if (!(est.total > 0)) return t('create.errTotal');
    if (cashPay && change < 0) return t('create.errTendered', { total: money(est.total) });
    if (kind && !providerName) return t(kind === 'bank' ? 'create.errBank' : 'create.errNetwork');
    if (!cashPay && !f.reference.trim()) return t('create.errReference');
    return '';
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    const p = problem(); if (p) { setErr(p); return; }
    setBusy(true);
    try {
      const body = {
        ...(f.customer ? { customerId: f.customer.id } : { walkInName: f.walkInName.trim() || null, walkInPhone: f.walkInPhone.trim() || null }),
        ...(canPick && f.salespersonId && { salespersonId: f.salespersonId }),
        notes: f.notes.trim() || null, taxRate: n(f.taxRate), lines: linesBody(f, canSetPrice),
        payment: { method: f.method, ...(cashPay && f.tendered !== '' && { amountTendered: n(f.tendered) }), ...(f.reference.trim() && { reference: kind ? joinReference(providerName, f.reference.trim()) : f.reference.trim() }) },
      };
      const s = await cashSaleApi.create(body);
      navigate(`/cash-sales/${s.id}`, { state: { msg: cashPay && change > 0 ? t('create.doneChange', { change: money(change) }) : t('create.done') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('new')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/cash-sales" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>

        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Lookup label={t('create.customer')} value={f.customer} placeholder={t('create.customerPh')} error={fe.customerId} search={searchCustomers}
              show={(c) => `${c.name} (${c.code})`} render={(c) => <>{c.name} <span className="text-xs">{c.code}{c.phone ? ` · ${c.phone}` : ''}</span></>}
              onPick={(c) => setF({ ...f, customer: c, salespersonId: c?.salespersonId || f.salespersonId })} />
          </div>
          {!f.customer && <>
            <Field label={t('create.walkInName')} error={fe.walkInName}><input className="input" maxLength={150} value={f.walkInName} onChange={set('walkInName')} /></Field>
            <Field label={t('create.walkInPhone')} error={fe.walkInPhone}><input className="input" maxLength={30} value={f.walkInPhone} onChange={set('walkInPhone')} /></Field>
          </>}
          {canPick ? (
            <Field label={t('create.salesperson')} error={fe.salespersonId}>
              <select className="input" value={f.salespersonId} onChange={set('salespersonId')}>
                <option value="">{f.customer ? t('create.customersSalesperson') : t('create.none')}</option>
                {(sps.data?.data || []).map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.code})</option>)}
              </select>
            </Field>
          ) : <p className="self-end pb-2 text-sm text-black">{t('create.recordedUnderYou')}</p>}
          <Field label={t('create.taxRate')} error={fe.taxRate}><input className="input" type="number" min="0" max="100" step="0.01" value={f.taxRate} onChange={set('taxRate')} /></Field>
          <div className="sm:col-span-2"><Field label={t('create.notes')} error={fe.notes}><textarea className="input" rows={2} maxLength={2000} value={f.notes} onChange={set('notes')} /></Field></div>
        </div>

        <SaleItemsEntry f={f} setF={setF} fe={fe} canSetPrice={canSetPrice} />

        <div className="max-w-3xl rounded-md border border-line p-4">
          <h2 className="mb-3 text-base font-semibold">{t('create.payment')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('create.method')} error={fe['payment.method']}>
              <select className="input" value={f.method} onChange={setMethod}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
            {kind && (
              <Field label={t(kind === 'bank' ? 'create.bank' : 'create.network')}>
                <select className="input" value={f.provider} onChange={set('provider')} aria-label={t(kind === 'bank' ? 'create.bank' : 'create.network')}>
                  <option value="">{t(kind === 'bank' ? 'create.pickBank' : 'create.pickNetwork')}</option>
                  {providers.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value={OTHER}>{t('create.other')}</option>
                </select>
              </Field>
            )}
            {kind && f.provider === OTHER && (
              <Field label={t(kind === 'bank' ? 'create.otherBank' : 'create.otherNetwork')}><input className="input" maxLength={MAX_PROVIDER} value={f.providerOther} onChange={set('providerOther')} /></Field>
            )}
            {cashPay ? (
              <Field label={t('create.received')} error={fe['payment.amountTendered']}>
                <input className="input" type="number" min="0" step="0.01" placeholder={money(est.total)} value={f.tendered} onChange={set('tendered')} />
              </Field>
            ) : (
              <Field label={t('create.reference')} error={fe['payment.reference']}><input className="input" maxLength={MAX_REF} value={f.reference} onChange={set('reference')} placeholder={t('create.referencePh')} /></Field>
            )}
            <div className="self-end pb-2 text-sm">
              <div>{t('create.toPay')} <b>{money(est.total)}</b></div>
              {cashPay && <div>{t('create.change')} <b>{change > 0 ? money(change) : '0.00'}</b></div>}
            </div>
          </div>
        </div>

        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : est.total > 0 ? t('create.completeAmount', { amount: money(est.total) }) : t('create.complete')}</button>
      </form>
    </div>
  );
}

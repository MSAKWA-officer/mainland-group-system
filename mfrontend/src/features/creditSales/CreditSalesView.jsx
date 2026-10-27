import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { creditSaleApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { METHOD, NOTICE, PayStatus, Status, day, money } from '../sales/saleUi.jsx';
import { ACCOUNT_KIND, accountLabel, accountsFor, splitReference } from '../sales/paymentProviders.js';
import { todayStr } from './CreditSalesForm.jsx';
import CreditStatus from './CreditStatus.jsx';
import { RowActions } from './CreditSalesList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

// Akaunti iliyosajiliwa ya malipo (mfano "CRDB — Mainland Ltd (0150…)"), au jina la zamani lililokuwa kwenye reference.
const payAccount = (p) => (p.bankAccount ? accountLabel(p.bankAccount) : splitReference(p.method, p.reference).provider);

// Record money received against the sale. The amount may not exceed the balance (the API checks too).
function PaymentForm({ sale, balance, onDone, onError }) {
  const { t } = useTranslation('creditSales');
  const { can } = useAuth();
  const [f, setF] = useState({ amount: String(balance), method: 'CASH', bankAccountId: '', reference: '', paidOn: todayStr(), notes: '' });
  const kind = ACCOUNT_KIND[f.method];                        // 'bank' | 'network' | undefined
  const accounts = useLoad(() => creditSaleApi.paymentAccounts(), []);
  const choices = accountsFor(f.method, accounts.data?.data);
  const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); onError(''); setFe({});
    const amount = Number(f.amount);
    if (!(amount > 0)) { onError(t('pay.errAmount')); return; }
    if (amount > balance + 0.0001) { onError(t('pay.errTooMuch', { balance: money(balance) })); return; }
    if (kind && !f.bankAccountId) { onError(t(kind === 'bank' ? 'pay.errBank' : 'pay.errNetwork')); return; }
    if (f.method !== 'CASH' && !f.reference.trim()) { onError(t('pay.errReference')); return; }
    setBusy(true);
    try {
      await creditSaleApi.receivePayment(sale.id, { amount, method: f.method, ...(kind && { bankAccountId: f.bankAccountId }), paidOn: f.paidOn || null, reference: f.reference.trim() || null, notes: f.notes.trim() || null });
      setF({ ...f, amount: '', reference: '', notes: '' }); onDone(t('pay.recorded'));
    } catch (x) { onError(errMsg(x)); setFe(fieldErrs(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-3 max-w-3xl rounded-md border border-line p-4 [&_.text-danger]:!text-black">
      <h3 className="mb-3 text-sm font-semibold">{t('pay.title')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('pay.amountBalance', { balance: money(balance) })} error={fe.amount}>
          <div className="flex gap-2"><input className="input" type="number" min="0" step="0.01" value={f.amount} onChange={set('amount')} />
            <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setF({ ...f, amount: String(balance) })}>{t('pay.fullBalance')}</button></div>
        </Field>
        <Field label={t('pay.method')} error={fe.method}><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value, bankAccountId: '' })}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {kind && (
          <Field label={t(kind === 'bank' ? 'pay.bank' : 'pay.network')} error={fe.bankAccountId}>
            <select className="input" value={f.bankAccountId} onChange={set('bankAccountId')} disabled={accounts.loading}>
              <option value="">{t(kind === 'bank' ? 'pay.pickBank' : 'pay.pickNetwork')}</option>
              {choices.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
            </select>
            {!accounts.loading && choices.length === 0 && (
              <p className="mt-1 text-xs text-black">{t(kind === 'bank' ? 'pay.noBanks' : 'pay.noNetworks')}{can('bank_accounts.create') && <> <Link to="/bank-accounts/new" className="underline">{t('pay.registerAccount')}</Link></>}</p>
            )}
          </Field>
        )}
        <Field label={f.method === 'CASH' ? t('pay.referenceOptional') : t('pay.reference')} error={fe.reference}><input className="input" maxLength={100} value={f.reference} onChange={set('reference')} placeholder={t('pay.referencePh')} /></Field>
        <Field label={t('pay.paidOn')} error={fe.paidOn}><input className="input" type="date" min={sale.saleDate} max={todayStr()} value={f.paidOn} onChange={set('paidOn')} /></Field>
        <div className="sm:col-span-2"><Field label={t('pay.notes')} error={fe.notes}><input className="input" maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
      </div>
      <button className="btn-primary mt-4" disabled={busy}>{busy ? t('pay.saving') : t('pay.record')}</button>
    </form>
  );
}

export default function CreditSalesView() {
  const { t } = useTranslation('creditSales');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => creditSaleApi.get(id), [id]);
  const r = q.data;
  const completed = r?.status === 'COMPLETED';
  const balance = completed ? Number(r.balance) : 0;
  const msg = ok || location.state?.msg;
  const voidPayment = async (p) => {
    const reason = window.prompt(t('view.voidPaymentPrompt', { receipt: p.receiptNo, amount: money(p.amount) }));
    if (!reason || reason.trim().length < 3) return;
    setErr(''); setOk('');
    try { await creditSaleApi.voidPayment(id, p.id, reason.trim()); setOk(t('view.paymentVoided')); q.reload(); } catch (x) { setErr(errMsg(x)); }
  };
  const lineHeads = ['sku', 'item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal'];
  const payHeads = ['receipt', 'date', 'method', 'reference', 'receivedBy', 'amount', 'state', ''];
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.saleNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-4 text-sm">{r ? <><Status status={r.status} />{completed && <PayStatus status={r.paymentStatus} />}</> : t('view.loading')}</p>
        </div>
        <Link to="/credit-sales" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          {r.isOverdue && <div className={NOTICE}><Banner>{t('view.overdueBanner', { amount: money(r.balance), date: day(r.dueDate) })}</Banner></div>}
          {['DRAFT', 'SUBMITTED'].includes(r.status) && r.customer && (
            <div className="mb-4 max-w-3xl"><h2 className="mb-2 text-base font-semibold">{t('view.creditPosition')}</h2><CreditStatus customerId={r.customer.id} total={r.total} /></div>
          )}
          <dl className="max-w-3xl">
            <Row label={t('view.customer')}>{r.customer && (can('customers.read')
              ? <Link to={`/customers/${r.customer.id}`} className="text-black underline">{r.customer.name} ({r.customer.code})</Link> : `${r.customer.name} (${r.customer.code})`)}</Row>
            <Row label={t('view.customerPhone')}>{r.customer?.phone}</Row>
            <Row label={t('view.salesperson')}>{r.salesperson && `${r.salesperson.fullName} (${r.salesperson.code})`}</Row>
            <Row label={t('view.saleDate')}>{day(r.saleDate)}</Row>
            <Row label={t('view.dueDate')}>{day(r.dueDate)}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.createdBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.submitted')}>{r.submittedAt && fmt(r.submittedAt)}</Row>
            <Row label={t('view.decisionNote')}>{r.approval?.decisionNote}</Row>
            <Row label={t('view.completed')}>{r.completedAt && fmt(r.completedAt)}</Row>
            <Row label={t('view.stockDocument')}>{r.stockDocument?.docNo}</Row>
            <Row label={t('view.cancelled')}>{r.cancelledAt && fmt(r.cancelledAt)}</Row>
            {r.status === 'VOIDED' && <><Row label={t('view.voided')}>{fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>

          <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.items')}</h2>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50"><tr>{lineHeads.map((h) => <th key={h} className="th px-3 py-2 font-normal uppercase text-black">{t(`view.${h}`)}</th>)}</tr></thead>
              <tbody>
                {(r.lines || []).map((l) => (
                  <tr key={l.id} className="odd:bg-slate-50/60">
                    <td className="td whitespace-nowrap px-3 text-black">{l.sku}</td>
                    <td className="td px-3 text-black">{l.itemName}</td>
                    <td className="td whitespace-nowrap px-3 text-black">{Number(l.quantity)} {l.unit}</td>
                    <td className="td px-3 text-right text-black">{money(l.unitPrice)}</td>
                    <td className="td px-3 text-right text-black">{Number(l.discountPercent)}</td>
                    <td className="td px-3 text-right text-black">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm text-black">
            <div className="flex justify-between"><dt>{t('view.subtotal')}</dt><dd>{money(r.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>{t('view.discount')}</dt><dd>{money(r.discountTotal)}</dd></div>
            <div className="flex justify-between"><dt>{t('view.tax', { rate: Number(r.taxRate) })}</dt><dd>{money(r.taxTotal)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>{t('view.total')}</dt><dd>{money(r.total)}</dd></div>
            {completed && <>
              <div className="flex justify-between"><dt>{t('view.paid')}</dt><dd>{money(r.amountPaid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>{t('view.balance')}</dt><dd>{money(balance)}</dd></div>
            </>}
          </dl>

          {(completed || (r.payments || []).length > 0) && (<>
            <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.payments')}</h2>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[44rem]">
                <thead className="bg-slate-50"><tr>{payHeads.map((h, i) => <th key={i} className="th px-3 py-2 font-normal uppercase text-black">{h && t(`view.${h}`)}</th>)}</tr></thead>
                <tbody>
                  {(r.payments || []).length === 0 && <tr><td className="td px-3 text-black" colSpan={8}>{t('view.noPayments')}</td></tr>}
                  {(r.payments || []).map((p) => (
                    <tr key={p.id} className={`odd:bg-slate-50/60 ${p.voidedAt ? 'line-through decoration-slate-400' : ''}`}>
                      <td className="td whitespace-nowrap px-3 text-black">{p.receiptNo}</td>
                      <td className="td whitespace-nowrap px-3 text-black">{day(p.paidOn)}</td>
                      <td className="td px-3 text-black">{METHOD[p.method] || p.method}{payAccount(p) && <div className="text-xs">{payAccount(p)}</div>}</td>
                      <td className="td px-3 text-black">{splitReference(p.method, p.reference).ref || '—'}</td>
                      <td className="td px-3 text-black">{p.receiver?.fullName}</td>
                      <td className="td px-3 text-right text-black">{money(p.amount)}</td>
                      <td className="td px-3 text-black" title={p.voidReason || undefined}>{p.voidedAt ? t('view.voidedState') : t('view.valid')}</td>
                      <td className="td px-3">{!p.voidedAt && completed && can('credit_sales.void_payment') && <button type="button" className="text-sm text-red-600 underline" onClick={() => voidPayment(p)}>{t('view.void')}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {completed && balance > 0 && can('credit_sales.receive_payment') && <PaymentForm sale={r} balance={balance} onError={(m) => { setErr(m); if (m) setOk(''); }} onDone={(m) => { setOk(m); setErr(''); q.reload(); }} />}
          </>)}

          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/credit-sales', { state: { msg: t('actions.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

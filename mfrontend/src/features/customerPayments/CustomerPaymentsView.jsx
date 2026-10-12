import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { customerPaymentApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { Dot, METHOD, NOTICE, Row, accountLabel, day, money } from '../banking/bankingUi.jsx';
import { RowActions } from './CustomerPaymentsList.jsx';

export default function CustomerPaymentsView() {
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => customerPaymentApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const voided = r?.status === 'VOIDED';
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.paymentNo : 'Customer payment'}</h1>
          <p className="mt-1 text-sm">{r ? <Dot value={r.status} /> : 'Loading…'}</p>
        </div>
        <Link to="/customer-payments" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />Back to list</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 max-w-sm rounded-md border border-line p-4">
            <div className="text-xs uppercase">Amount received</div>
            <div className={`mt-1 text-2xl font-semibold ${voided ? 'text-slate-500 line-through' : ''}`}>{money(r.amount)}</div>
          </div>
          <dl className="max-w-3xl">
            <Row label="Customer">{r.customer && (can('customers.read') ? <Link to={`/customers/${r.customer.id}`} className="text-black underline">{r.customer.name} ({r.customer.code})</Link> : `${r.customer.name} (${r.customer.code})`)}</Row>
            <Row label="Payment date">{day(r.paidOn)}</Row>
            <Row label="Method">{METHOD[r.method] || r.method}</Row>
            <Row label="Reference">{r.reference}</Row>
            <Row label="Paid into">{r.bankAccount ? (can('bank_accounts.read') ? <Link to={`/bank-accounts/${r.bankAccount.id}`} className="text-black underline">{accountLabel(r.bankAccount)}</Link> : accountLabel(r.bankAccount)) : 'Not banked'}</Row>
            <Row label="Received by">{r.receiver?.fullName}</Row>
            <Row label="Recorded">{fmt(r.createdAt)}</Row>
            <Row label="Notes">{r.notes}</Row>
            {voided && <><Row label="Voided by">{r.voider?.fullName}</Row><Row label="Voided on">{r.voidedAt && fmt(r.voidedAt)}</Row><Row label="Void reason">{r.voidReason}</Row></>}
          </dl>

          <h2 className="mb-2 mt-6 text-base font-semibold">Applied to sales</h2>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50"><tr>{['Sale', 'Sale date', 'Due', 'Sale total', 'Receipt', 'Applied'].map((h) => <th key={h} className={`th px-3 py-2 font-normal uppercase text-black ${['Sale total', 'Applied'].includes(h) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {(r.allocations || []).length === 0 && <tr><td className="td px-3 text-black" colSpan={6}>Nothing applied.</td></tr>}
                {(r.allocations || []).map((a) => (
                  <tr key={a.id} className="odd:bg-slate-50/60">
                    <td className="td whitespace-nowrap px-3 text-black">{a.sale ? (can('credit_sales.read') ? <Link to={`/credit-sales/${a.sale.id}`} className="underline">{a.sale.saleNo}</Link> : a.sale.saleNo) : '—'}</td>
                    <td className="td whitespace-nowrap px-3 text-black">{day(a.sale?.saleDate)}</td>
                    <td className="td whitespace-nowrap px-3 text-black">{day(a.sale?.dueDate)}</td>
                    <td className="td px-3 text-right text-black">{money(a.sale?.total)}</td>
                    <td className="td whitespace-nowrap px-3 text-black">{a.salePayment?.receiptNo}{a.salePayment?.voidedAt && <span className="ml-2 text-xs">(voided)</span>}</td>
                    <td className={`td px-3 text-right ${a.salePayment?.voidedAt ? 'text-slate-500 line-through' : 'text-black'}`}>{money(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(r.bankTransactions || []).length > 0 && (<>
            <h2 className="mb-2 mt-6 text-base font-semibold">Bank ledger</h2>
            <ul className="max-w-3xl space-y-1 text-sm">
              {r.bankTransactions.map((t) => (
                <li key={t.id}>{can('bank_transactions.read') ? <Link to={`/bank-transactions/${t.id}`} className="underline">{t.txnNo}</Link> : t.txnNo}
                  {' · '}{day(t.txnDate)}{' · '}<Dot value={t.status} />{t.isReconciled && ' · reconciled'}</li>
              ))}
            </ul>
          </>)}

          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }} />
          </div>
        </div>
      )}
    </div>
  );
}

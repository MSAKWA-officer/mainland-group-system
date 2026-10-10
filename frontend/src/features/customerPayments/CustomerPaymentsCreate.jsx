import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { customerApi, customerPaymentApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { Lookup, searchCustomers } from '../sales/saleForm.jsx';
import { AccountSelect, METHOD, NEEDS_BANK, NOTICE, PageHead, day, fromCents, money, toCents, today, useAccounts } from '../banking/bankingUi.jsx';

const dueKey = (s) => `${s.dueDate || s.saleDate}|${s.saleDate}|${s.saleNo}`;

// Receive money from a customer. By default it is applied to their oldest unpaid credit sales first; "Choose sales" lets you split it yourself.
// The whole amount must be applied: there is no customer credit, so paying more than is owed is refused.
export default function CustomerPaymentsCreate() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const accounts = useAccounts('TZS');
  const [customer, setCustomer] = useState(null);
  const [f, setF] = useState({ amount: '', method: 'CASH', bankAccountId: '', reference: '', paidOn: today(), notes: '' });
  const [mode, setMode] = useState('AUTO');                       // AUTO = oldest first (server decides), MANUAL = per-sale amounts below
  const [alloc, setAlloc] = useState({});                          // saleId -> amount string (MANUAL mode)
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pre = sp.get('customerId');
  useEffect(() => { if (pre) customerApi.get(pre).then(setCustomer, () => {}); }, [pre]);
  const open = useLoad(() => (customer ? customerPaymentApi.openSales(customer.id) : Promise.resolve(null)), [customer?.id]);   // eslint-disable-line
  const sales = useMemo(() => [...(open.data?.data || [])].sort((a, b) => dueKey(a).localeCompare(dueKey(b))), [open.data]);
  useEffect(() => { setAlloc({}); }, [customer?.id]);             // eslint-disable-line

  const owed = sales.reduce((s, x) => s + toCents(x.balance), 0);
  const amt = toCents(f.amount);
  // What oldest-first would do with this amount (shown as a preview; the server does the real work).
  const fifo = useMemo(() => {
    let left = amt; const out = {};
    for (const s of sales) { if (left <= 0) break; const take = Math.min(left, toCents(s.balance)); out[s.id] = take; left -= take; }
    return out;
  }, [sales, amt]);
  const applied = mode === 'AUTO' ? Math.min(amt, owed) : Object.values(alloc).reduce((s, v) => s + toCents(v), 0);
  const fillOldest = () => setAlloc(Object.fromEntries(Object.entries(fifo).map(([k, v]) => [k, fromCents(v)])));
  const needsBank = NEEDS_BANK.includes(f.method);

  const problem = () => {
    if (!customer) return 'Choose the customer.';
    if (!(amt > 0)) return 'Enter an amount greater than 0.';
    if (needsBank && !f.bankAccountId) return 'Choose the bank account this payment was paid into.';
    if (f.method !== 'CASH' && !f.reference.trim()) return 'Enter the payment reference (transaction / receipt number).';
    if (sales.length === 0) return 'This customer has no unpaid credit sales.';
    if (mode === 'AUTO' && amt > owed) return `Amount is more than what this customer owes (${money(owed / 100)}).`;
    if (mode === 'MANUAL') {
      for (const s of sales) { const a = toCents(alloc[s.id]); if (a > toCents(s.balance)) return `${s.saleNo}: amount is more than its balance (${money(s.balance)}).`; }
      if (!Object.values(alloc).some((v) => toCents(v) > 0)) return 'Enter an amount against at least one sale.';
      if (applied !== amt) return `The amounts below add up to ${money(applied / 100)} but the payment is ${money(amt / 100)}.`;
    }
    return '';
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    const p = problem(); if (p) { setErr(p); return; }
    setBusy(true);
    try {
      const body = { customerId: customer.id, amount: Number(f.amount), method: f.method, bankAccountId: f.bankAccountId || null, reference: f.reference.trim() || null,
        paidOn: f.paidOn || undefined, notes: f.notes.trim() || null };
      if (mode === 'MANUAL') body.allocations = sales.filter((s) => toCents(alloc[s.id]) > 0).map((s) => ({ saleId: s.id, amount: Number(alloc[s.id]) }));
      const r = await customerPaymentApi.create(body);
      navigate(`/customer-payments/${r.id}`, { state: { msg: 'Payment recorded.' } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  const oldestSale = sales[0]?.saleDate;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title="Receive customer payment" sub="Record money received from a customer and apply it to their unpaid credit sales.">
        <Link to="/customer-payments" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />Back to list</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || open.error || accounts.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Lookup label="Customer" value={customer} onPick={setCustomer} search={searchCustomers} placeholder="Search customer by name or code"
              show={(c) => `${c.name} (${c.code})`} render={(c) => <>{c.name} <span className="text-xs">({c.code})</span></>} error={fe.customerId} />
          </div>
          <Field label="Amount received" error={fe.amount}>
            <div className="flex gap-2"><input className="input" type="number" min="0.01" step="0.01" required value={f.amount} onChange={set('amount')} />
              {customer && owed > 0 && <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setF({ ...f, amount: fromCents(owed) })}>Pay all</button>}</div>
          </Field>
          <Field label="Method" error={fe.method}>
            <select className="input" value={f.method} onChange={set('method')}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label={needsBank ? 'Paid into bank account' : 'Paid into bank account (optional)'} error={fe.bankAccountId}>
            <AccountSelect required={needsBank} accounts={accounts.data?.data} value={f.bankAccountId} onChange={set('bankAccountId')} placeholder={needsBank ? 'Select an account…' : 'Not banked (cash in hand)'} />
            <p className="mt-1 text-xs">When an account is chosen, the money is added to its ledger. Only TZS accounts can be used.</p>
          </Field>
          <Field label={f.method === 'CASH' ? 'Reference (optional)' : 'Reference'} error={fe.reference}>
            <input className="input" maxLength={100} placeholder="Transaction / receipt / cheque no" value={f.reference} onChange={set('reference')} />
          </Field>
          <Field label="Payment date" error={fe.paidOn}><input className="input" type="date" min={oldestSale || undefined} max={today()} value={f.paidOn} onChange={set('paidOn')} /></Field>
          <Field label="Notes (optional)" error={fe.notes}><input className="input" maxLength={500} value={f.notes} onChange={set('notes')} /></Field>
        </div>

        {customer && (
          <div className="max-w-3xl">
            <h2 className="mb-2 text-base font-semibold">Unpaid credit sales{sales.length > 0 && <span className="ml-2 text-sm font-normal">· {money(owed / 100)} owed</span>}</h2>
            {open.loading && <p className="text-sm">Loading…</p>}
            {!open.loading && sales.length === 0 && !open.error && <p className="rounded-md border border-line p-3 text-sm">This customer has no unpaid credit sales.</p>}
            {sales.length > 0 && (<>
              <div className="mb-3 flex flex-wrap items-center gap-5 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'AUTO'} onChange={() => setMode('AUTO')} />Oldest due first (automatic)</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'MANUAL'} onChange={() => setMode('MANUAL')} />Choose sales</label>
                {mode === 'MANUAL' && <button type="button" className="btn-ghost" onClick={fillOldest} disabled={!(amt > 0)}>Fill oldest first</button>}
              </div>
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[40rem]">
                  <thead className="bg-slate-50"><tr>{['Sale', 'Sale date', 'Due', 'Total', 'Balance', 'This payment'].map((h) => <th key={h} className={`th px-3 py-2 font-normal uppercase text-black ${['Total', 'Balance', 'This payment'].includes(h) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id} className="odd:bg-slate-50/60">
                        <td className="td whitespace-nowrap px-3 text-black">{s.saleNo}</td>
                        <td className="td whitespace-nowrap px-3 text-black">{day(s.saleDate)}</td>
                        <td className={`td whitespace-nowrap px-3 ${s.dueDate && s.dueDate < today() ? 'font-semibold text-red-600' : 'text-black'}`}>{day(s.dueDate)}</td>
                        <td className="td px-3 text-right text-black">{money(s.total)}</td>
                        <td className="td px-3 text-right text-black">{money(s.balance)}</td>
                        <td className="td px-3 text-right text-black">
                          {mode === 'AUTO' ? (fifo[s.id] ? money(fifo[s.id] / 100) : '—')
                            : <input className="input ml-auto w-32 text-right" type="number" min="0" step="0.01" max={s.balance} aria-label={`Amount for ${s.saleNo}`} value={alloc[s.id] ?? ''} onChange={(e) => setAlloc({ ...alloc, [s.id]: e.target.value })} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-slate-50">
                    <td className="td px-3 font-semibold text-black" colSpan={5}>Applied</td>
                    <td className={`td px-3 text-right font-semibold ${applied !== amt && amt > 0 ? 'text-red-600' : 'text-black'}`}>{money(applied / 100)} <span className="text-xs font-normal">of {money(amt / 100)}</span></td>
                  </tr></tfoot>
                </table>
              </div>
              {fe.allocations && <p className="mt-1 text-xs">{fe.allocations}</p>}
            </>)}
          </div>
        )}
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, expenseApi, fieldErrs, paymentApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { Lookup } from '../sales/saleForm.jsx';
import { AccountSelect, METHOD, NEEDS_BANK, NOTICE, PageHead, day, money, today, useAccounts } from '../banking/bankingUi.jsx';

// Approved expenses that still have money to pay.
const searchExpenses = (q) => expenseApi.list({ ...(q && { search: q }), status: 'APPROVED', limit: 20 }).then((r) => r.data.filter((e) => Number(e.outstandingAmount) > 0));

// Pay an approved expense (never more than what is still outstanding), or pay someone directly by typing the payee.
// When a bank account is chosen, a withdrawal is posted to its ledger at the same time, so it cannot overdraw the account.
// Text: locales/<lang>/payments.json. Expense category names come from expenses.json.
export default function PaymentsCreate() {
  const { t } = useTranslation('payments');
  const { t: te } = useTranslation('expenses');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const accounts = useAccounts('TZS');
  const [kind, setKind] = useState(sp.get('expenseId') ? 'EXPENSE' : 'DIRECT');
  const [expense, setExpense] = useState(null);
  const [f, setF] = useState({ payee: '', amount: '', method: 'CASH', bankAccountId: '', reference: '', paidOn: today(), notes: '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pre = sp.get('expenseId');
  useEffect(() => { if (pre) expenseApi.get(pre).then((x) => pick(x), (x) => setErr(errMsg(x))); }, [pre]);   // eslint-disable-line
  const pick = (x) => {
    setExpense(x);
    if (x) setF((p) => ({ ...p, amount: String(Number(x.outstandingAmount)), payee: x.payee || p.payee }));
  };
  const switchKind = (k) => { setKind(k); setExpense(null); setFe({}); };

  const outstanding = expense ? Number(expense.outstandingAmount) : null;
  const needsBank = NEEDS_BANK.includes(f.method);
  const acc = (accounts.data?.data || []).find((a) => a.id === f.bankAccountId);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    const amount = Number(f.amount);
    if (kind === 'EXPENSE' && !expense) { setErr(t('create.err.chooseExpense')); return; }
    if (kind === 'DIRECT' && !f.payee.trim()) { setFe({ payee: t('create.err.payeeRequired') }); return; }
    if (!(amount > 0)) { setFe({ amount: t('create.err.amountPositive') }); return; }
    if (outstanding != null && amount > outstanding + 0.0001) { setFe({ amount: t('create.err.atMost', { max: money(outstanding) }) }); return; }
    if (needsBank && !f.bankAccountId) { setFe({ bankAccountId: t('create.err.chooseBank') }); return; }
    if (f.method !== 'CASH' && !f.reference.trim()) { setFe({ reference: t('create.err.needRef') }); return; }
    setBusy(true);
    try {
      const p = await paymentApi.create({ ...(kind === 'EXPENSE' ? { expenseId: expense.id } : {}), payee: f.payee.trim() || null, amount, method: f.method,
        bankAccountId: f.bankAccountId || null, reference: f.reference.trim() || null, paidOn: f.paidOn || undefined, notes: f.notes.trim() || null });
      navigate(`/payments/${p.id}`, { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/payments" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || accounts.error}</Banner></div>
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="kind" checked={kind === 'EXPENSE'} onChange={() => switchKind('EXPENSE')} />{t('create.kindExpense')}</label>
          <label className="flex items-center gap-2"><input type="radio" name="kind" checked={kind === 'DIRECT'} onChange={() => switchKind('DIRECT')} />{t('create.kindDirect')}</label>
        </div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          {kind === 'EXPENSE' && (
            <div className="sm:col-span-2">
              <Lookup label={t('create.expense')} value={expense} onPick={pick} search={searchExpenses} placeholder={t('create.expensePlaceholder')}
                show={(x) => `${x.expenseNo} · ${x.description}`} render={(x) => <>{x.expenseNo} · {x.description} <span className="text-xs">{t('create.left', { amount: money(x.outstandingAmount) })}</span></>} error={fe.expenseId} />
              {expense && (
                <p className="mt-2 rounded-md border border-line p-3 text-sm">
                  <Trans i18nKey="create.expenseSummary" ns="payments" components={{ b: <b /> }}
                    values={{ category: te(`category.${expense.category}`, { defaultValue: expense.category }), date: day(expense.expenseDate), total: money(expense.amount),
                      paid: money(expense.paidAmount), left: money(expense.outstandingAmount) }} />
                </p>
              )}
            </div>
          )}
          <Field label={kind === 'EXPENSE' ? t('create.payeeExpense') : t('create.paidTo')} error={fe.payee}>
            <input className="input" maxLength={150} required={kind === 'DIRECT'} value={f.payee} onChange={set('payee')} />
          </Field>
          <Field label={t('create.amount')} error={fe.amount}>
            <div className="flex gap-2"><input className="input" type="number" required min="0.01" step="0.01" value={f.amount} onChange={set('amount')} />
              {outstanding != null && <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setF({ ...f, amount: String(outstanding) })}>{t('create.fullBalance')}</button>}</div>
          </Field>
          <Field label={t('create.method')} error={fe.method}>
            <select className="input" value={f.method} onChange={set('method')}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label={needsBank ? t('create.paidFrom') : t('create.paidFromOptional')} error={fe.bankAccountId}>
            <AccountSelect required={needsBank} accounts={accounts.data?.data} value={f.bankAccountId} onChange={set('bankAccountId')} placeholder={needsBank ? t('create.selectAccount') : t('create.notFromBank')} />
            <p className="mt-1 text-xs">{acc && !acc.allowOverdraft ? t('create.noOverdraft') : ''}{t('create.onlyTzs')}</p>
          </Field>
          <Field label={f.method === 'CASH' ? t('create.referenceOptional') : t('create.reference')} error={fe.reference}>
            <input className="input" maxLength={100} placeholder={t('create.referencePlaceholder')} value={f.reference} onChange={set('reference')} />
          </Field>
          <Field label={t('create.paymentDate')} error={fe.paidOn}><input className="input" type="date" min={expense?.expenseDate || undefined} max={today()} value={f.paidOn} onChange={set('paidOn')} /></Field>
          <div className="sm:col-span-2"><Field label={t('create.notes')} error={fe.notes}><input className="input" maxLength={500} value={f.notes} onChange={set('notes')} /></Field></div>
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.submit')}</button>
      </form>
    </div>
  );
}

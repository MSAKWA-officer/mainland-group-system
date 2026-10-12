import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { bankTransactionApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { AccountSelect, NOTICE, PageHead, today, useAccounts } from '../banking/bankingUi.jsx';

// Manual entry types; the labels come from locales/<lang>/bankTransactions.json (manualType.<CODE>).
const MANUAL_CODES = ['DEPOSIT', 'WITHDRAWAL', 'CHARGE', 'INTEREST'];

// A manual ledger entry: deposit, withdrawal, bank charge or interest. Transfers have their own screen; customer payments and
// supplier payments post to the ledger by themselves, so they cannot be entered here.
export default function BankTransactionsCreate() {
  const { t } = useTranslation('bankTransactions');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const accounts = useAccounts();
  const [f, setF] = useState({ bankAccountId: sp.get('bankAccountId') || '', type: 'DEPOSIT', amount: '', txnDate: today(), counterparty: '', reference: '', description: '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const acc = (accounts.data?.data || []).find((a) => a.id === f.bankAccountId);
  const out = ['WITHDRAWAL', 'CHARGE'].includes(f.type);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!(Number(f.amount) > 0)) { setFe({ amount: t('create.amountError') }); return; }
    if (!f.reference.trim() && !f.description.trim()) { setFe({ description: t('create.refError') }); return; }
    setBusy(true);
    try {
      const r = await bankTransactionApi.create({ bankAccountId: f.bankAccountId, type: f.type, amount: Number(f.amount), txnDate: f.txnDate || undefined,
        counterparty: f.counterparty.trim() || null, reference: f.reference.trim() || null, description: f.description.trim() || null });
      navigate(`/bank-transactions/${r.id}`, { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/bank-transactions" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || accounts.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t('create.account')} error={fe.bankAccountId}><AccountSelect required accounts={accounts.data?.data} value={f.bankAccountId} onChange={set('bankAccountId')} placeholder={t('create.selectAccount')} /></Field>
          </div>
          <Field label={t('create.type')} error={fe.type}>
            <select className="input" value={f.type} onChange={set('type')}>{MANUAL_CODES.map((k) => <option key={k} value={k}>{t(`manualType.${k}`)}</option>)}</select>
          </Field>
          <Field label={acc ? t('create.amountCur', { currency: acc.currency }) : t('create.amount')} error={fe.amount}>
            <input className="input" type="number" required min="0.01" step="0.01" value={f.amount} onChange={set('amount')} />
            <p className="mt-1 text-xs">{out ? t('create.moneyOut') : t('create.moneyIn')}{out && acc && !acc.allowOverdraft ? t('create.noOverdraft') : ''}</p>
          </Field>
          <Field label={t('create.date')} error={fe.txnDate}><input className="input" type="date" required min={acc?.openingDate || undefined} max={today()} value={f.txnDate} onChange={set('txnDate')} /></Field>
          <Field label={t('create.counterparty')} error={fe.counterparty}><input className="input" maxLength={150} placeholder={t('create.counterpartyPlaceholder')} value={f.counterparty} onChange={set('counterparty')} /></Field>
          <Field label={t('create.reference')} error={fe.reference}><input className="input" maxLength={100} value={f.reference} onChange={set('reference')} /></Field>
          <Field label={t('create.description')} error={fe.description}><input className="input" maxLength={255} value={f.description} onChange={set('description')} /></Field>
        </div>
        <p className="text-xs">{t('create.needRef')}</p>
        <button className="btn-primary" disabled={busy}>{busy ? t('create.posting') : t('create.submit')}</button>
      </form>
    </div>
  );
}

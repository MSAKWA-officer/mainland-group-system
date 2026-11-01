import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fundReceiptApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { AccountSelect, NOTICE, PageHead, today, useAccounts } from '../banking/bankingUi.jsx';
import { PURPOSES, SOURCES } from './FundReceiptList.jsx';

// Receive money into a bank account for a purpose (fuel, expenses, other). Saving posts a DEPOSIT to the bank ledger in the same step.
export default function FundReceiptCreate() {
  const { t } = useTranslation('fundReceipts');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const accounts = useAccounts('TZS');
  const [f, setF] = useState({ bankAccountId: sp.get('bankAccountId') || '', source: 'OWNER_CAPITAL', receivedFrom: '', purpose: 'FUEL', amount: '', receiptDate: today(), reference: '', notes: '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const acc = (accounts.data?.data || []).find((a) => a.id === f.bankAccountId);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!(Number(f.amount) > 0)) { setFe({ amount: t('form.amountError') }); return; }
    setBusy(true);
    try {
      const r = await fundReceiptApi.create({ bankAccountId: f.bankAccountId, source: f.source, receivedFrom: f.receivedFrom.trim(), purpose: f.purpose, amount: Number(f.amount),
        receiptDate: f.receiptDate || undefined, reference: f.reference.trim() || null, notes: f.notes.trim() || null });
      navigate(`/fund-receipts/${r.id}`, { state: { msg: t('form.saved', { no: r.receiptNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/fund-receipts" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || accounts.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t('form.account')} error={fe.bankAccountId}><AccountSelect required accounts={accounts.data?.data} value={f.bankAccountId} onChange={set('bankAccountId')} placeholder={t('form.selectAccount')} /></Field>
          </div>
          <Field label={t('form.source')} error={fe.source}><select className="input" value={f.source} onChange={set('source')}>{SOURCES.map((k) => <option key={k} value={k}>{t(`source.${k}`)}</option>)}</select></Field>
          <Field label={t('form.receivedFrom')} error={fe.receivedFrom}><input className="input" required maxLength={150} placeholder={t('form.receivedFromPlaceholder')} value={f.receivedFrom} onChange={set('receivedFrom')} /></Field>
          <Field label={t('form.purpose')} error={fe.purpose}><select className="input" value={f.purpose} onChange={set('purpose')}>{PURPOSES.map((k) => <option key={k} value={k}>{t(`purpose.${k}`)}</option>)}</select></Field>
          <Field label={acc ? t('form.amountCur', { currency: acc.currency }) : t('form.amount')} error={fe.amount}><input className="input" type="number" required min="0.01" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
          <Field label={t('form.date')} error={fe.receiptDate}><input className="input" type="date" required min={acc?.openingDate || undefined} max={today()} value={f.receiptDate} onChange={set('receiptDate')} /></Field>
          <Field label={t('form.reference')} error={fe.reference}><input className="input" maxLength={100} value={f.reference} onChange={set('reference')} /></Field>
          <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><input className="input" maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
        </div>
        <p className="text-xs">{t('form.hint')}</p>
        <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : t('form.submit')}</button>
      </form>
    </div>
  );
}

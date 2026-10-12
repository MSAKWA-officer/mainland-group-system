import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, fieldErrs, transferApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { AccountSelect, NOTICE, PageHead, today, useAccounts } from '../banking/bankingUi.jsx';

// Move money between two of your own accounts (same currency). Posts money out of one account and into the other as one record.
export default function TransfersCreate() {
  const { t } = useTranslation('transfers');
  const navigate = useNavigate();
  const accounts = useAccounts();
  const [f, setF] = useState({ fromAccountId: '', toAccountId: '', amount: '', txnDate: today(), reference: '', description: '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const list = accounts.data?.data || [];
  const from = list.find((a) => a.id === f.fromAccountId); const to = list.find((a) => a.id === f.toAccountId);
  const pick = t('create.selectAccount');
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (f.fromAccountId === f.toAccountId) { setFe({ toAccountId: t('create.err.sameAccount') }); return; }
    if (from && to && from.currency !== to.currency) { setErr(t('create.err.currencyMismatch', { from: from.currency, to: to.currency })); return; }
    if (!(Number(f.amount) > 0)) { setFe({ amount: t('create.err.amountPositive') }); return; }
    if (!f.reference.trim() && !f.description.trim()) { setFe({ description: t('create.err.needRefOrDesc') }); return; }
    setBusy(true);
    try {
      const res = await transferApi.create({ fromAccountId: f.fromAccountId, toAccountId: f.toAccountId, amount: Number(f.amount), txnDate: f.txnDate || undefined,
        reference: f.reference.trim() || null, description: f.description.trim() || null });
      navigate(`/transfers/${res.transferGroupId}`, { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/transfers" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || accounts.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label={t('create.fromAccount')} error={fe.fromAccountId}><AccountSelect required accounts={list} value={f.fromAccountId} onChange={set('fromAccountId')} placeholder={pick} /></Field>
          <Field label={t('create.toAccount')} error={fe.toAccountId}><AccountSelect required accounts={list.filter((a) => a.id !== f.fromAccountId)} value={f.toAccountId} onChange={set('toAccountId')} placeholder={pick} /></Field>
          <Field label={from ? t('create.amountCur', { currency: from.currency }) : t('create.amount')} error={fe.amount}><input className="input" type="number" required min="0.01" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
          <Field label={t('create.date')} error={fe.txnDate}><input className="input" type="date" required max={today()} value={f.txnDate} onChange={set('txnDate')} /></Field>
          <Field label={t('create.reference')} error={fe.reference}><input className="input" maxLength={100} value={f.reference} onChange={set('reference')} /></Field>
          <Field label={t('create.description')} error={fe.description}><input className="input" maxLength={255} value={f.description} onChange={set('description')} /></Field>
        </div>
        <p className="text-xs">{t('create.hint')}</p>
        <button className="btn-primary" disabled={busy}>{busy ? t('create.posting') : t('create.submit')}</button>
      </form>
    </div>
  );
}

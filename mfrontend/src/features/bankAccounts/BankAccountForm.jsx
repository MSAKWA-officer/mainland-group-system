import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { bankAccountApi, bankApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, TYPE_CODES } from './BankAccountsList.jsx';

const EMPTY = { bankId: '', accountNo: '', accountName: '', accountType: 'CURRENT', currency: 'TZS', branch: '', openingBalance: '0', openingDate: '', allowOverdraft: false, notes: '' };
const today = () => new Date().toISOString().slice(0, 10);

// One page for both "New account" (/bank-accounts/new) and "Edit account" (/bank-accounts/:id/edit).
export default function BankAccountForm() {
  const { t } = useTranslation('bankAccounts');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const [sp] = useSearchParams();
  const editing = !!id;
  const navigate = useNavigate();
  const cur = useLoad(() => (editing ? bankAccountApi.get(id) : Promise.resolve(null)), [id]);
  const banks = useLoad(() => bankApi.list({ limit: 100, ...(editing ? {} : { isActive: true }) }), [editing]);
  const [f, setF] = useState({ ...EMPTY, bankId: sp.get('bankId') || '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = cur.data;
  useEffect(() => {
    if (d) setF({ bankId: d.bankId, accountNo: d.accountNo, accountName: d.accountName, accountType: d.accountType, currency: d.currency, branch: d.branch || '',
      openingBalance: String(d.openingBalance ?? 0), openingDate: d.openingDate || '', allowOverdraft: !!d.allowOverdraft, notes: d.notes || '' });
  }, [d]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const locked = editing && d?.transactionCount > 0;        // the server refuses to change these once the account has activity
  const toBody = () => ({
    bankId: f.bankId, accountNo: f.accountNo.trim(), accountName: f.accountName.trim(), accountType: f.accountType, currency: f.currency.trim().toUpperCase(),
    branch: f.branch.trim() || null, openingBalance: Number(f.openingBalance || 0), ...(f.openingDate && { openingDate: f.openingDate }),
    allowOverdraft: f.allowOverdraft, notes: f.notes.trim() || null,
  });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      if (editing) { await bankAccountApi.update(id, toBody()); navigate(`/bank-accounts/${id}`, { state: { msg: t('form.updated') } }); }
      else { await bankAccountApi.create(toBody()); navigate('/bank-accounts', { state: { msg: t('form.created') } }); }
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  const bankList = banks.data?.data || [];
  const lockNote = locked && <p className="mt-1 text-xs">{t('form.locked')}</p>;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{editing ? t('form.editTitle') : t('form.newTitle')}</h1>
          <p className="mt-1 text-sm">{editing ? (d ? `${d.accountNo} · ${d.accountName}` : tc('loading')) : t('form.newSub')}</p>
        </div>
        <Link to={editing ? `/bank-accounts/${id}` : '/bank-accounts'} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{editing ? t('form.back') : t('form.backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || cur.error || banks.error}</Banner></div>
        {(!editing || d) && (<>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('form.bank')} error={fe.bankId}>
                <select className="input disabled:bg-slate-50" required disabled={locked} value={f.bankId} onChange={set('bankId')}>
                  <option value="">{t('form.selectBank')}</option>
                  {bankList.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isActive ? '' : t('form.inactiveSuffix')}</option>)}
                </select>{lockNote}
              </Field>
            </div>
            <Field label={t('form.accountNo')} error={fe.accountNo}>
              <input className="input read-only:bg-slate-50" required minLength={3} maxLength={40} pattern="[A-Za-z0-9 \-]+" title={t('form.accountNoTitle')} readOnly={locked} value={f.accountNo} onChange={set('accountNo')} />
            </Field>
            <Field label={t('form.accountName')} error={fe.accountName}><input className="input" required minLength={2} maxLength={150} placeholder={t('form.accountNamePlaceholder')} value={f.accountName} onChange={set('accountName')} /></Field>
            <Field label={t('form.accountType')} error={fe.accountType}>
              <select className="input" value={f.accountType} onChange={set('accountType')}>{TYPE_CODES.map((k) => <option key={k} value={k}>{t(`type.${k}`)}</option>)}</select>
            </Field>
            <Field label={t('form.currency')} error={fe.currency}>
              <input className="input uppercase read-only:bg-slate-50" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" title={t('form.currencyTitle')} readOnly={locked} value={f.currency} onChange={set('currency')} />
              <p className="mt-1 text-xs">{t('form.currencyNote')}</p>
            </Field>
            <Field label={t('form.branch')} error={fe.branch}><input className="input" maxLength={100} value={f.branch} onChange={set('branch')} /></Field>
            <Field label={t('form.openingBalance')} error={fe.openingBalance}>
              <input className="input read-only:bg-slate-50" type="number" required min="0" step="0.01" readOnly={locked} value={f.openingBalance} onChange={set('openingBalance')} />
            </Field>
            <Field label={editing ? t('form.openingDate') : t('form.openingDateNew')} error={fe.openingDate}>
              <input className="input read-only:bg-slate-50" type="date" max={today()} readOnly={locked} value={f.openingDate} onChange={set('openingDate')} />
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={f.allowOverdraft} onChange={(e) => setF({ ...f, allowOverdraft: e.target.checked })} />
                {t('form.allowOverdraft')}
              </label>
              {fe.allowOverdraft && <p className="mt-1 text-xs">{fe.allowOverdraft}</p>}
            </div>
            <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={255} value={f.notes} onChange={set('notes')} /></Field></div>
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : editing ? t('form.saveChanges') : t('form.saveNew')}</button>
        </>)}
      </form>
    </div>
  );
}

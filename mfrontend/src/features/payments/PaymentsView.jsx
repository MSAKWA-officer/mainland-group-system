import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { paymentApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { METHOD, NOTICE, Row, accountLabel, day, money } from '../banking/bankingUi.jsx';
import { PaymentStatus, RowActions } from './PaymentsList.jsx';

export default function PaymentsView() {
  const { t } = useTranslation('payments');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => paymentApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const voided = r?.status === 'VOIDED';
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.paymentNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <PaymentStatus value={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/payments" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 max-w-sm rounded-md border border-line p-4">
            <div className="text-xs uppercase">{t('view.amountPaid')}</div>
            <div className={`mt-1 text-2xl font-semibold ${voided ? 'text-slate-500 line-through' : ''}`}>{money(r.amount)}</div>
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.paidTo')}>{r.payee}</Row>
            <Row label={t('view.expense')}>{r.expense && (can('expenses.read') ? <Link to={`/expenses/${r.expense.id}`} className="text-black underline">{r.expense.expenseNo} · {r.expense.description}</Link> : `${r.expense.expenseNo} · ${r.expense.description}`)}</Row>
            <Row label={t('view.paymentDate')}>{day(r.paidOn)}</Row>
            <Row label={t('view.method')}>{METHOD[r.method] || r.method}</Row>
            <Row label={t('view.reference')}>{r.reference}</Row>
            <Row label={t('view.paidFrom')}>{r.bankAccount ? (can('bank_accounts.read') ? <Link to={`/bank-accounts/${r.bankAccount.id}`} className="text-black underline">{accountLabel(r.bankAccount)}</Link> : accountLabel(r.bankAccount)) : t('view.notFromBank')}</Row>
            <Row label={t('view.recordedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.recorded')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            {voided && <><Row label={t('view.voidedBy')}>{r.voider?.fullName}</Row><Row label={t('view.voidedOn')}>{r.voidedAt && fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>

          {(r.bankTransactions || []).length > 0 && (<>
            <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.ledgerTitle')}</h2>
            <ul className="max-w-3xl space-y-1 text-sm">
              {r.bankTransactions.map((x) => (
                <li key={x.id}>{can('bank_transactions.read') ? <Link to={`/bank-transactions/${x.id}`} className="underline">{x.txnNo}</Link> : x.txnNo}
                  {' · '}{t(`txnType.${x.type}`, { defaultValue: x.type })}{' · '}{money(x.amount)}{' · '}{day(x.txnDate)}{' · '}<PaymentStatus value={x.status} />{x.isReconciled && t('view.reconciledSuffix')}</li>
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

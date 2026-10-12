import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { bankTransactionApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, Row, accountLabel, day, money } from '../banking/bankingUi.jsx';
import { RowActions, TxnStatus } from './BankTransactionsList.jsx';

export default function BankTransactionsView() {
  const { t } = useTranslation('bankTransactions');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => bankTransactionApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const link = (perm, to, text) => (can(perm) ? <Link to={to} className="text-black underline">{text}</Link> : text);
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.txnNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-4 text-sm">{r ? <><TxnStatus value={r.status} /><span>{r.isReconciled ? t('view.reconciled') : t('view.notReconciled')}</span></> : tc('loading')}</p>
        </div>
        <Link to="/bank-transactions" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 max-w-sm rounded-md border border-line p-4">
            <div className="text-xs uppercase">{r.direction === 'CREDIT' ? t('view.moneyIn') : t('view.moneyOut')}</div>
            <div className={`mt-1 text-2xl font-semibold ${r.status === 'VOIDED' ? 'text-slate-500 line-through' : ''}`}>{money(r.amount)} <span className="text-sm font-normal">{r.account?.currency}</span></div>
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.type')}>{t(`type.${r.type}`, { defaultValue: r.type })}</Row>
            <Row label={t('view.account')}>{r.account && link('bank_accounts.read', `/bank-accounts/${r.account.id}`, accountLabel(r.account))}</Row>
            <Row label={t('view.date')}>{day(r.txnDate)}</Row>
            <Row label={t('view.reference')}>{r.reference}</Row>
            <Row label={t('view.description')}>{r.description}</Row>
            <Row label={t('view.counterparty')}>{r.counterparty}</Row>
            {r.transferGroupId && <Row label={t('view.transfer')}><Link to={`/bank-transactions?transferGroupId=${r.transferGroupId}`} className="text-black underline">{t('view.seeTransfer')}</Link></Row>}
            {r.customerPaymentId && <Row label={t('view.customerPayment')}>{link('customer_payments.read', `/customer-payments/${r.customerPaymentId}`, r.customerPayment?.paymentNo || t('view.viewPayment'))}</Row>}
            {r.paymentId && <Row label={t('view.payment')}>{link('payments.read', `/payments/${r.paymentId}`, t('view.viewPayment'))}</Row>}
            <Row label={t('view.postedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.posted')}>{fmt(r.createdAt)}</Row>
            {r.isReconciled && <><Row label={t('view.reconciledBy')}>{r.reconciler?.fullName}</Row><Row label={t('view.reconciledOn')}>{r.reconciledAt && fmt(r.reconciledAt)}</Row></>}
            {r.status === 'VOIDED' && <><Row label={t('view.voidedBy')}>{r.voider?.fullName}</Row><Row label={t('view.voidedOn')}>{r.voidedAt && fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>
          {r.status === 'POSTED' && (r.customerPaymentId || r.paymentId) && (
            <p className="mt-3 max-w-3xl text-sm">{r.customerPaymentId ? t('view.byCustomerPayment') : t('view.byPayment')}</p>
          )}
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }} />
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { fundReceiptApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, Row, accountLabel, day, money } from '../banking/bankingUi.jsx';
import { ReceiptStatus, RowActions } from './FundReceiptList.jsx';

export default function FundReceiptView() {
  const { t } = useTranslation('fundReceipts');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => fundReceiptApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const link = (perm, to, text) => (can(perm) ? <Link to={to} className="text-black underline">{text}</Link> : text);
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.receiptNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-4 text-sm">{r ? <ReceiptStatus value={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/fund-receipts" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 max-w-sm rounded-md border border-line p-4">
            <div className="text-xs uppercase">{t('view.amount')}</div>
            <div className={`mt-1 text-2xl font-semibold ${r.status === 'VOIDED' ? 'text-slate-500 line-through' : ''}`}>{money(r.amount)} <span className="text-sm font-normal">{r.bankAccount?.currency}</span></div>
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.account')}>{r.bankAccount && link('bank_accounts.read', `/bank-accounts/${r.bankAccount.id}`, accountLabel(r.bankAccount))}</Row>
            <Row label={t('view.date')}>{day(r.receiptDate)}</Row>
            <Row label={t('view.source')}>{t(`source.${r.source}`, { defaultValue: r.source })}</Row>
            <Row label={t('view.receivedFrom')}>{r.receivedFrom}</Row>
            <Row label={t('view.purpose')}>{t(`purpose.${r.purpose}`, { defaultValue: r.purpose })}</Row>
            <Row label={t('view.reference')}>{r.reference}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.bankRows')}>{(r.bankTransactions || []).length
              ? r.bankTransactions.map((x) => <div key={x.id}>{link('bank_transactions.read', `/bank-transactions/${x.id}`, x.txnNo)} · {money(x.amount)} · {t(`status.${x.status}`, { defaultValue: x.status })}{x.isReconciled ? ` · ${t('view.reconciled')}` : ''}</div>) : '—'}</Row>
            <Row label={t('view.postedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.posted')}>{fmt(r.createdAt)}</Row>
            {r.status === 'VOIDED' && <><Row label={t('view.voidedBy')}>{r.voider?.fullName}</Row><Row label={t('view.voidedOn')}>{r.voidedAt && fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }} />
          </div>
        </div>
      )}
    </div>
  );
}

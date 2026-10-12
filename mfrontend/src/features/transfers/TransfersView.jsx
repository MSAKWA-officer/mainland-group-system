import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { transferApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, Row, accountLabel, day, money } from '../banking/bankingUi.jsx';
import { RowActions, TransferStatus } from './TransfersList.jsx';

export default function TransfersView() {
  const { t } = useTranslation('transfers');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => transferApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const side = (s) => s && (<>
    {can('bank_accounts.read') ? <Link to={`/bank-accounts/${s.account.id}`} className="text-black underline">{accountLabel(s.account)}</Link> : accountLabel(s.account)}
    <div className="text-xs">{can('bank_transactions.read') ? <Link to={`/bank-transactions/${s.txnId}`} className="underline">{s.txnNo}</Link> : s.txnNo}{s.isReconciled && t('view.reconciledSuffix')}</div>
  </>);
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <TransferStatus value={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/transfers" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 max-w-sm rounded-md border border-line p-4">
            <div className="text-xs uppercase">{t('view.amount')}</div>
            <div className={`mt-1 text-2xl font-semibold ${r.status === 'VOIDED' ? 'text-slate-500 line-through' : ''}`}>{money(r.amount)}</div>
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.from')}>{side(r.from)}</Row>
            <Row label={t('view.to')}>{side(r.to)}</Row>
            <Row label={t('view.date')}>{day(r.txnDate)}</Row>
            <Row label={t('view.reference')}>{r.reference}</Row>
            <Row label={t('view.description')}>{r.description}</Row>
            <Row label={t('view.doneBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.recorded')}>{fmt(r.createdAt)}</Row>
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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { fuelFundingApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { FUEL_TYPE, FuelDot, METHOD, NOTICE, Row, Stat, TXN_LABEL, Th, accountLabel, day, litres, money } from '../fuel/fuelUi.jsx';
import { RowActions } from './FuelFundingList.jsx';

const TXN_COLS = ['txnNo', 'date', 'type', 'amount', 'status', 'reconciled'];

export default function FuelFundingView() {
  const { t } = useTranslation('fuelFunding');
  const { t: tc } = useTranslation('common');
  const { t: tb } = useTranslation('bankTransactions');   // transaction types, Posted / Voided and Yes / No already live here
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => fuelFundingApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const approved = r?.status === 'APPROVED';
  const decided = r && ['APPROVED', 'REJECTED'].includes(r.status);
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.fundingNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <FuelDot value={r.status} /> : tc('loading')}</p>
        </div>
        <div className="flex items-center gap-4">
          {approved && can('fuel_usage.create') && <Link to={`/fuel-usage/new?fundingId=${r.id}`} className="btn-primary gap-2"><PlusIcon />{t('view.recordUsage')}</Link>}
          <Link to="/fuel-funding" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
        </div>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-3">
            <Stat label={t('view.amount')} value={money(r.amount)} />
            <Stat label={t('view.litresPlanned')} value={r.litres != null ? litres(r.litres) : '—'} />
            <Stat label={t('view.paidBy')} value={METHOD[r.method] || r.method} />
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.vehicle')}>{r.vehicle && <>
              {can('vehicles.read') ? <Link to={`/vehicles/${r.vehicle.id}`} className="underline">{r.vehicle.plateNo}</Link> : r.vehicle.plateNo}
              {r.vehicle.fuelType && ` (${FUEL_TYPE[r.vehicle.fuelType] || r.vehicle.fuelType})`}
            </>}</Row>
            <Row label={t('view.driver')}>{r.driver && (can('drivers.read') ? <Link to={`/drivers/${r.driver.id}`} className="underline">{r.driver.fullName}</Link> : r.driver.fullName)}</Row>
            <Row label={t('view.purpose')}>{r.purpose}</Row>
            <Row label={t('view.fundingDate')}>{day(r.fundingDate)}</Row>
            <Row label={t('view.bankAccount')}>{r.bankAccount && accountLabel(r.bankAccount)}</Row>
            <Row label={t('view.reference')}>{r.reference}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.raisedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.raised')}>{fmt(r.createdAt)}</Row>
            {decided && <>
              <Row label={approved ? t('view.approvedBy') : t('view.rejectedBy')}>{r.decider?.fullName}</Row>
              <Row label={t('view.decidedOn')}>{r.decidedAt && fmt(r.decidedAt)}</Row>
              <Row label={t('view.decisionNote')}>{r.decisionNote}</Row>
            </>}
            {(approved || r.disbursedOn) && <Row label={t('view.moneyGivenOn')}>{day(r.disbursedOn)}</Row>}
            {r.status === 'VOIDED' && <><Row label={t('view.voidedBy')}>{r.voider?.fullName}</Row><Row label={t('view.voidedOn')}>{r.voidedAt && fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>

          {(r.bankTransactions || []).length > 0 && (<>
            <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.bankEntriesTitle')}</h2>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[34rem]">
                <thead className="bg-slate-50"><tr>{TXN_COLS.map((k) => <Th key={k} right={k === 'amount'}>{t(`view.cols.${k}`)}</Th>)}</tr></thead>
                <tbody>
                  {r.bankTransactions.map((x) => (
                    <tr key={x.id} className="odd:bg-slate-50/60">
                      <td className="td whitespace-nowrap px-6 text-black">{can('bank_transactions.read') ? <Link to={`/bank-transactions/${x.id}`} className="underline">{x.txnNo}</Link> : x.txnNo}</td>
                      <td className="td whitespace-nowrap px-6 text-black">{day(x.txnDate)}</td>
                      <td className="td px-6 text-black">{tb(`type.${x.type}`, { defaultValue: TXN_LABEL[x.type] || x.type })}</td>
                      <td className={`td whitespace-nowrap px-6 text-right ${x.status === 'VOIDED' ? 'text-slate-500 line-through' : 'text-black'}`}>{money(x.amount)}</td>
                      <td className="td px-6 text-black">{x.status === 'VOIDED' ? tb('status.VOIDED') : tb('status.POSTED')}</td>
                      <td className="td px-6 text-black">{x.isReconciled ? tb('yes') : tb('no')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {approved && can('fuel_balances.read') && <p className="mt-4 text-sm"><Link to={`/fuel-balances/${r.id}`} className="underline">{t('view.seeSpent')}</Link></p>}
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }} />
          </div>
        </div>
      )}
    </div>
  );
}

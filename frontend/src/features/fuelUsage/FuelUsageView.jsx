import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { fuelUsageApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt, fmtNum } from '../../utils/format';
import { NOTICE, Row, Stat, day, money } from '../fuel/fuelUi.jsx';
import { RowActions, UsageStatus } from './FuelUsageList.jsx';

export default function FuelUsageView() {
  const { t } = useTranslation('fuelUsage');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => fuelUsageApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const fuelType = (c) => t(`fuelType.${c}`, { defaultValue: c });
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.usageNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <UsageStatus value={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/fuel-usage" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-3">
            <Stat label={t('view.amountPaid')} value={money(r.amount)} />
            <Stat label={t('view.litres')} value={`${fmtNum(r.litres, 3)} L`} />
            <Stat label={t('view.pricePerLitre')} value={money(r.pricePerLitre)} />
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.funding')}>{can('fuel_balances.read') && r.funding ? <Link to={`/fuel-balances/${r.funding.id}`} className="underline">{r.funding.fundingNo}</Link> : r.funding?.fundingNo}</Row>
            <Row label={t('view.vehicle')}>{r.vehicle && `${r.vehicle.plateNo}${r.vehicle.fuelType ? ` (${fuelType(r.vehicle.fuelType)})` : ''}`}</Row>
            <Row label={t('view.driver')}>{r.driver?.fullName}</Row>
            <Row label={t('view.date')}>{day(r.usageDate)}</Row>
            <Row label={t('view.odometer')}>{r.odometerKm != null && `${fmtNum(r.odometerKm, 1)} km`}</Row>
            <Row label={t('view.tankFilled')}>{r.isFullTank ? t('view.yes') : t('view.partFill')}</Row>
            <Row label={t('view.station')}>{r.station}</Row>
            <Row label={t('view.receiptNo')}>{r.receiptNo}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.recordedBy')}>{r.creator?.fullName}</Row>
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

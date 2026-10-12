import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { vehicleApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { ActiveDot, FUEL_TYPE, NOTICE, Row, Stat, VEHICLE_TYPE, qty } from '../fuel/fuelUi.jsx';
import { RowActions } from './VehiclesList.jsx';

export default function VehiclesView() {
  const { t } = useTranslation('vehicles');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => vehicleApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.plateNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <ActiveDot active={r.isActive} /> : tc('loading')}</p>
        </div>
        <div className="flex items-center gap-4">
          {r?.isActive && can('fuel_funding.create') && <Link to={`/fuel-funding/new?vehicleId=${r.id}`} className="btn-primary gap-2"><PlusIcon />{t('view.requestFunding')}</Link>}
          <Link to="/vehicles" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
        </div>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-3">
            <Stat label={t('view.fuelType')} value={FUEL_TYPE[r.fuelType] || r.fuelType} />
            <Stat label={t('view.tankCapacity')} value={r.tankCapacityLitres != null ? `${qty(r.tankCapacityLitres)} L` : '—'} />
            <Stat label={t('view.fuelFundings')} value={r.fundingCount} />
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.code')}>{r.code}</Row>
            <Row label={t('view.plateNo')}>{r.plateNo}</Row>
            <Row label={t('view.make')}>{r.make}</Row>
            <Row label={t('view.model')}>{r.model}</Row>
            <Row label={t('view.year')}>{r.year != null && String(r.year)}</Row>
            <Row label={t('view.vehicleType')}>{VEHICLE_TYPE[r.vehicleType] || r.vehicleType}</Row>
            <Row label={t('view.defaultDriver')}>{r.driver && <>
              {can('drivers.read') ? <Link to={`/drivers/${r.driver.id}`} className="underline">{r.driver.fullName}</Link> : r.driver.fullName}
              {` (${r.driver.code})`}{r.driver.phone && ` · ${r.driver.phone}`}{!r.driver.isActive && ` · ${t('view.inactive')}`}
            </>}</Row>
            <Row label={t('view.status')}><ActiveDot active={r.isActive} /></Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          {r.fundingCount > 0 && can('fuel_funding.read') && (
            <p className="mt-4 text-sm"><Link to={`/fuel-funding?vehicleId=${r.id}`} className="underline">{t('view.seeFunding')}</Link></p>
          )}
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }}
              afterDelete={(m) => navigate('/vehicles', { state: { msg: m } })} />
          </div>
        </div>
      )}
    </div>
  );
}

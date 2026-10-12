import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { driverApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { ActiveDot, FuelDot, NOTICE, Row, Stat, day } from '../fuel/fuelUi.jsx';
import { RowActions } from './DriversList.jsx';

export default function DriversView() {
  const { t } = useTranslation('drivers');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => driverApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.fullName : t('view.fallbackTitle')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-4 text-sm">{r ? <><ActiveDot active={r.isActive} /><FuelDot value={r.licenseStatus} /></> : tc('loading')}</p>
        </div>
        <Link to="/drivers" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-3">
            <Stat label={t('view.licenceExpires')} value={day(r.licenseExpiry)} tone={r.licenseStatus === 'EXPIRED' ? 'text-red-600' : ''} />
            <Stat label={t('view.vehicles')} value={r.vehicleCount} />
            <Stat label={t('view.fuelFundings')} value={r.fundingCount} />
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.code')}>{r.code}</Row>
            <Row label={t('view.fullName')}>{r.fullName}</Row>
            <Row label={t('view.phone')}>{r.phone}</Row>
            <Row label={t('view.licenseNo')}>{r.licenseNo}</Row>
            <Row label={t('view.licenseClass')}>{r.licenseClass}</Row>
            <Row label={t('view.licenseExpiry')}>{day(r.licenseExpiry)}</Row>
            <Row label={t('view.address')}>{r.address}</Row>
            <Row label={t('view.linkedStaff')}>{r.staff && `${r.staff.fullName} (${r.staff.code})${r.staff.isActive ? '' : ` · ${t('view.inactive')}`}`}</Row>
            <Row label={t('view.status')}><ActiveDot active={r.isActive} /></Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>

          <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.defaultDriverOf', { n: (r.vehicles || []).length })}</h2>
          <div className="max-w-3xl rounded-md border border-line px-4 py-3 text-sm">
            {(r.vehicles || []).length === 0 && <span>{t('view.noVehicles')}</span>}
            <ul className="space-y-1">
              {(r.vehicles || []).map((v) => (
                <li key={v.id} className="flex items-center gap-3">
                  {can('vehicles.read') ? <Link to={`/vehicles/${v.id}`} className="underline">{v.plateNo}</Link> : v.plateNo}
                  <span className="text-xs">{v.code}</span>{!v.isActive && <span className="text-xs">· {t('view.inactive')}</span>}
                </li>
              ))}
            </ul>
          </div>

          {r.fundingCount > 0 && can('fuel_funding.read') && (
            <p className="mt-4 text-sm"><Link to={`/fuel-funding?driverId=${r.id}`} className="underline">{t('view.seeFunding')}</Link></p>
          )}
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }}
              afterDelete={(m) => navigate('/drivers', { state: { msg: m } })} />
          </div>
        </div>
      )}
    </div>
  );
}

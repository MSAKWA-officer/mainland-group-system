import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { vehicleLogApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt, fmtNum } from '../../utils/format';
import { FuelDot, NOTICE, Row, day } from '../fuel/fuelUi.jsx';
import { RowActions } from './VehicleLogList.jsx';

export default function VehicleLogView() {
  const { t } = useTranslation('vehicleLog');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => vehicleLogApi.get(id), [id]);
  const x = q.data;
  const msg = ok || location.state?.msg;
  const kmv = (v) => (v == null ? '—' : `${fmtNum(v, 1)} km`);
  const hm = (v) => (v ? String(v).slice(0, 5) : '—');
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{x ? x.tripNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-4 text-sm">{x ? <><FuelDot value={x.status} />{x.endKm == null && x.status === 'ACTIVE' && <span>{t('list.open')}</span>}</> : tc('loading')}</p>
        </div>
        <Link to="/vehicle-log" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {x && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.vehicle')}>{x.vehicle?.plateNo} · {x.vehicle?.make}</Row>
            <Row label={t('view.date')}>{day(x.tripDate)}</Row>
            <Row label={t('view.userName')}>{x.userName}</Row>
            <Row label={t('view.purpose')}>{x.purpose}</Row>
            <Row label={t('view.timeStart')}>{hm(x.timeStart)}</Row>
            <Row label={t('view.startKm')}>{kmv(x.startKm)}</Row>
            <Row label={t('view.timeEnd')}>{hm(x.timeEnd)}</Row>
            <Row label={t('view.endKm')}>{kmv(x.endKm)}</Row>
            <Row label={t('view.totalKm')}>{kmv(x.totalKm)}</Row>
            <Row label={t('view.notes')}>{x.notes}</Row>
            <Row label={t('view.recordedBy')}>{x.creator?.fullName}</Row>
            <Row label={t('view.recordedOn')}>{fmt(x.createdAt)}</Row>
            {x.status === 'VOIDED' && <><Row label={t('view.voidedBy')}>{x.voider?.fullName}</Row><Row label={t('view.voidedOn')}>{x.voidedAt && fmt(x.voidedAt)}</Row><Row label={t('view.voidReason')}>{x.voidReason}</Row></>}
          </dl>
          <div className="mt-4 pb-2"><RowActions r={x} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }} /></div>
        </div>
      )}
    </div>
  );
}

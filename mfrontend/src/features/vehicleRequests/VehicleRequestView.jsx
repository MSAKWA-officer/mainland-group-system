import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { driverApi, errMsg, fieldErrs, vehicleApi, vehicleRequestApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, Row, day } from '../fuel/fuelUi.jsx';
import { ReqStatus, RowActions } from './VehicleRequestList.jsx';

const loadVehicles = async (s) => (await vehicleApi.list({ limit: 20, isActive: 'true', ...(s && { search: s }) })).data.map((v) => ({ ...v, label: `${v.plateNo} · ${v.make}${v.model ? ` ${v.model}` : ''}` }));
const loadDrivers = async (s) => (await driverApi.list({ limit: 20, isActive: 'true', ...(s && { search: s }) })).data.map((d) => ({ id: d.id, label: `${d.fullName} (${d.code})` }));
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function VehicleRequestView() {
  const { t } = useTranslation('vehicleRequests');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [vehicle, setVehicle] = useState(null); const [driver, setDriver] = useState(null); const [taken, setTaken] = useState(nowLocal());
  const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const q = useLoad(() => vehicleRequestApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const changed = (m) => { setOk(m || ''); setErr(''); q.reload(); };
  const issue = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      await vehicleRequestApi.issueKey(id, { vehicleId: vehicle.id, driverId: driver?.id, keyTakenAt: taken ? new Date(taken).toISOString() : undefined });
      setOk(t('issue.done')); setVehicle(null); setDriver(null); q.reload();
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); }
    setBusy(false);
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.requestNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <ReqStatus value={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/vehicle-requests" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.date')}>{day(r.requestDate)}</Row>
            <Row label={t('view.userName')}>{r.userName}</Row>
            <Row label={t('view.department')}>{r.department}</Row>
            <Row label={t('view.purpose')}>{r.purpose}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.raisedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.approver')}>{r.decider?.fullName}</Row>
            <Row label={t('view.decidedOn')}>{r.decidedAt && fmt(r.decidedAt)}</Row>
            <Row label={t('view.decisionNote')}>{r.decisionNote}</Row>
            <Row label={t('view.plate')}>{r.vehicle && `${r.vehicle.plateNo} · ${r.vehicle.make}`}</Row>
            <Row label={t('view.driver')}>{r.driver?.fullName}</Row>
            <Row label={t('view.keyTaken')}>{r.keyTakenAt && fmt(r.keyTakenAt)}</Row>
            <Row label={t('view.keyIssuedBy')}>{r.keyIssuer?.fullName}</Row>
            <Row label={t('view.keyReturned')}>{r.keyReturnedAt && fmt(r.keyReturnedAt)}</Row>
            {r.status === 'VOIDED' && <><Row label={t('view.voidedBy')}>{r.voider?.fullName}</Row><Row label={t('view.voidedOn')}>{r.voidedAt && fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>
          <div className="mt-4"><RowActions r={r} onChanged={changed} onError={(m) => { setErr(m); if (m) setOk(''); }} /></div>
          {r.status === 'APPROVED' && can('vehicle_requests.issue_key') && (
            <form onSubmit={issue} className="mt-6 max-w-3xl space-y-4 border-t border-line pt-4 [&_.text-danger]:!text-black">
              <h2 className="text-base font-semibold">{t('issue.title')}</h2>
              <p className="text-sm">{t('issue.sub')}</p>
              <Field label={t('issue.vehicle')} error={fe.vehicleId}><Picker value={vehicle?.id} selected={vehicle} load={loadVehicles} onPick={(v) => { setVehicle(v); if (v?.driver && !driver) setDriver({ id: v.driver.id, label: `${v.driver.fullName} (${v.driver.code})` }); }} placeholder={t('issue.selectVehicle')} required /></Field>
              <Field label={t('issue.driver')} error={fe.driverId}><Picker value={driver?.id} selected={driver} load={loadDrivers} onPick={setDriver} placeholder={t('issue.defaultDriver')} /></Field>
              <Field label={t('issue.keyTaken')} error={fe.keyTakenAt}><input className="input" type="datetime-local" required max={nowLocal()} value={taken} onChange={(e) => setTaken(e.target.value)} /></Field>
              <button className="btn-primary" disabled={busy || !vehicle}>{busy ? t('issue.saving') : t('issue.submit')}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

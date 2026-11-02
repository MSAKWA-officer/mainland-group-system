import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, fieldErrs, vehicleApi, vehicleLogApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import VehicleLogForm, { EMPTY, toBody } from './VehicleLogForm.jsx';

const load = async (s) => (await vehicleApi.list({ limit: 20, isActive: 'true', ...(s && { search: s }) })).data.map((v) => ({ id: v.id, label: `${v.plateNo} · ${v.make}${v.model ? ` ${v.model}` : ''}` }));

// Opens (or records) one line of the vehicle USE registration. Leave the end time and final mileage empty to open the trip; close it later by editing.
export default function VehicleLogCreate() {
  const { t } = useTranslation('vehicleLog');
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  // Picking a vehicle fills the initial mileage with the final mileage of its last closed trip (the user can still change it).
  const pick = async (v) => {
    setVehicle(v);
    if (!v) return;
    try {
      const last = (await vehicleLogApi.list({ vehicleId: v.id, status: 'ACTIVE', limit: 10, sortBy: 'tripDate', sortDir: 'desc' })).data.find((x) => x.endKm != null);
      if (last) setF((p) => (p.startKm === '' ? { ...p, startKm: String(Number(last.endKm)) } : p));
    } catch { /* optional convenience */ }
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!vehicle) { setFe({ vehicleId: t('create.chooseVehicle') }); return; }
    setBusy(true);
    try {
      const x = await vehicleLogApi.create({ vehicleId: vehicle.id, ...toBody(f) });
      navigate(`/vehicle-log/${x.id}`, { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/vehicle-log" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <div className="max-w-3xl"><Field label={t('create.vehicle')} error={fe.vehicleId}><Picker value={vehicle?.id} selected={vehicle} load={load} onPick={pick} placeholder={t('create.selectVehicle')} required /></Field></div>
        <VehicleLogForm f={f} setF={setF} fe={fe} />
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.submit')}</button>
      </form>
    </div>
  );
}

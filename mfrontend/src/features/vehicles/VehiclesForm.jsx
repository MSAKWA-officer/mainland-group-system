import { useTranslation } from 'react-i18next';
import { driverApi } from '../../api/index.js';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { FUEL_TYPE, VEHICLE_TYPE, driverOption } from '../fuel/fuelUi.jsx';

export const EMPTY = { plateNo: '', make: '', model: '', year: '', vehicleType: 'TRUCK', fuelType: 'DIESEL', tankCapacityLitres: '', driver: null, notes: '' };

// Form state -> request body (blank optional fields become null so an edit can clear them).
// The default driver is only sent when the user may assign drivers (vehicles.assign): the server refuses the key itself otherwise, even if it is unchanged.
export const toBody = (f, canAssign) => ({
  plateNo: f.plateNo.trim(), make: f.make.trim(), model: f.model.trim() || null, year: f.year === '' ? null : Number(f.year),
  vehicleType: f.vehicleType, fuelType: f.fuelType, tankCapacityLitres: f.tankCapacityLitres === '' ? null : Number(f.tankCapacityLitres),
  notes: f.notes.trim() || null, ...(canAssign && { driverId: f.driver?.id || null }),
});

// Saved vehicle (from the API) -> form state.
export const fromVehicle = (v) => ({
  plateNo: v.plateNo, make: v.make, model: v.model || '', year: v.year == null ? '' : String(v.year), vehicleType: v.vehicleType, fuelType: v.fuelType,
  tankCapacityLitres: v.tankCapacityLitres == null ? '' : String(Number(v.tankCapacityLitres)), notes: v.notes || '',
  driver: v.driver ? driverOption(v.driver) : null,
});

// Active drivers for the default-driver picker.
const loadDrivers = async (s) => (await driverApi.list({ limit: 20, isActive: 'true', ...(s && { search: s }) })).data.map(driverOption);

// Shared by VehiclesCreate and VehiclesUpdate.
export default function VehiclesForm({ f, setF, fe }) {
  const { t } = useTranslation('vehicles');
  const { can } = useAuth();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const year = new Date().getFullYear() + 1;
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.plateNo')} error={fe.plateNo}>
        <input className="input uppercase" required minLength={3} maxLength={20} placeholder={t('form.platePlaceholder')} value={f.plateNo} onChange={set('plateNo')} />
      </Field>
      <div className="flex items-end pb-2 text-sm">{t('form.plateHint')}</div>
      <Field label={t('form.make')} error={fe.make}><input className="input" required minLength={2} maxLength={60} placeholder={t('form.makePlaceholder')} value={f.make} onChange={set('make')} /></Field>
      <Field label={t('form.model')} error={fe.model}><input className="input" maxLength={60} value={f.model} onChange={set('model')} /></Field>
      <Field label={t('form.year')} error={fe.year}><input className="input" type="number" min="1950" max={year} step="1" value={f.year} onChange={set('year')} /></Field>
      <Field label={t('form.tank')} error={fe.tankCapacityLitres}>
        <input className="input" type="number" min="0.01" max="100000" step="0.01" value={f.tankCapacityLitres} onChange={set('tankCapacityLitres')} />
      </Field>
      <Field label={t('form.vehicleType')} error={fe.vehicleType}>
        <select className="input" value={f.vehicleType} onChange={set('vehicleType')}>{Object.entries(VEHICLE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </Field>
      <Field label={t('form.fuelType')} error={fe.fuelType}>
        <select className="input" value={f.fuelType} onChange={set('fuelType')}>{Object.entries(FUEL_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('form.driver')} error={fe.driverId}>
          {can('vehicles.assign')
            ? <Picker value={f.driver?.id} selected={f.driver} load={loadDrivers} onPick={(d) => setF({ ...f, driver: d })} placeholder={t('form.driverPlaceholder')} />
            : <p className="input bg-slate-50">{f.driver ? f.driver.label : t('form.driverPlaceholder')}</p>}
        </Field>
        <p className="mt-1 text-xs">{can('vehicles.assign') ? t('form.driverHintCan') : t('form.driverHintCannot')}</p>
      </div>
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={255} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

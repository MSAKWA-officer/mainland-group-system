import { useTranslation } from 'react-i18next';
import Field from '../../components/Field.jsx';
import { fmtNum } from '../../utils/format';
import { today } from '../fuel/fuelUi.jsx';

export const EMPTY = { tripDate: today(), userName: '', purpose: '', timeStart: '', startKm: '', timeEnd: '', endKm: '', notes: '' };

// Form state -> request body. Blank end fields mean the trip is still open. Total mileage is NOT sent: the server calculates it.
export const toBody = (f) => ({
  tripDate: f.tripDate || undefined, userName: f.userName.trim(), purpose: f.purpose.trim(), timeStart: f.timeStart, startKm: Number(f.startKm),
  timeEnd: f.timeEnd || null, endKm: f.endKm === '' ? null : Number(f.endKm), notes: f.notes.trim() || null,
});
export const fromTrip = (x) => ({
  tripDate: x.tripDate || today(), userName: x.userName || '', purpose: x.purpose || '', timeStart: (x.timeStart || '').slice(0, 5), startKm: String(Number(x.startKm)),
  timeEnd: (x.timeEnd || '').slice(0, 5), endKm: x.endKm == null ? '' : String(Number(x.endKm)), notes: x.notes || '',
});

// Shared by VehicleLogCreate and VehicleLogUpdate (the vehicle is chosen in Create only).
export default function VehicleLogForm({ f, setF, fe }) {
  const { t } = useTranslation('vehicleLog');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = f.startKm !== '' && f.endKm !== '' ? Math.round((Number(f.endKm) - Number(f.startKm)) * 10) / 10 : null;
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.date')} error={fe.tripDate}><input className="input" type="date" required max={today()} value={f.tripDate} onChange={set('tripDate')} /></Field>
      <Field label={t('form.userName')} error={fe.userName}><input className="input" required maxLength={100} value={f.userName} onChange={set('userName')} /></Field>
      <div className="sm:col-span-2"><Field label={t('form.purpose')} error={fe.purpose}><input className="input" required maxLength={200} value={f.purpose} onChange={set('purpose')} /></Field></div>
      <Field label={t('form.timeStart')} error={fe.timeStart}><input className="input" type="time" required value={f.timeStart} onChange={set('timeStart')} /></Field>
      <Field label={t('form.startKm')} error={fe.startKm}><input className="input" type="number" required min="0" step="0.1" value={f.startKm} onChange={set('startKm')} /></Field>
      <Field label={t('form.timeEnd')} error={fe.timeEnd}><input className="input" type="time" value={f.timeEnd} onChange={set('timeEnd')} /></Field>
      <Field label={t('form.endKm')} error={fe.endKm}><input className="input" type="number" min="0" step="0.1" value={f.endKm} onChange={set('endKm')} /></Field>
      <p className="text-sm sm:col-span-2">{total != null && total >= 0 ? t('form.total', { km: fmtNum(total, 1) }) : t('form.openHint')}</p>
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

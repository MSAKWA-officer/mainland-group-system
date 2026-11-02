import { useTranslation } from 'react-i18next';
import Field from '../../components/Field.jsx';
import { today } from '../fuel/fuelUi.jsx';

export const EMPTY = { requestDate: today(), userName: '', department: '', purpose: '', notes: '' };
export const toBody = (f) => ({ requestDate: f.requestDate || undefined, userName: f.userName.trim(), department: f.department.trim(), purpose: f.purpose.trim(), notes: f.notes.trim() || null });
export const fromRequest = (r) => ({ requestDate: r.requestDate || today(), userName: r.userName || '', department: r.department || '', purpose: r.purpose || '', notes: r.notes || '' });

// The part of the REQUEST form the vehicle user fills in. Shared by Create and Update.
export default function VehicleRequestForm({ f, setF, fe }) {
  const { t } = useTranslation('vehicleRequests');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.date')} error={fe.requestDate}><input className="input" type="date" required min={today()} value={f.requestDate} onChange={set('requestDate')} /></Field>
      <Field label={t('form.userName')} error={fe.userName}><input className="input" required maxLength={100} value={f.userName} onChange={set('userName')} /></Field>
      <Field label={t('form.department')} error={fe.department}><input className="input" required maxLength={100} value={f.department} onChange={set('department')} /></Field>
      <div className="sm:col-span-2"><Field label={t('form.purpose')} error={fe.purpose}><input className="input" required maxLength={255} value={f.purpose} onChange={set('purpose')} /></Field></div>
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

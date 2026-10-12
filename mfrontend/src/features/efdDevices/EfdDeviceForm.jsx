import { useTranslation } from 'react-i18next';
import Field from '../../components/Field.jsx';

export const EMPTY = { serialNo: '', name: '', tin: '', vrn: '', location: '', notes: '' };

// Form state -> request body (blank optional fields become null so an edit can clear them).
export const toBody = (f) => ({
  serialNo: f.serialNo.trim(), name: f.name.trim(), tin: f.tin.trim(),
  vrn: f.vrn.trim() || null, location: f.location.trim() || null, notes: f.notes.trim() || null,
});

// Saved device (from the API) -> form state.
export const fromDevice = (d) => ({ serialNo: d.serialNo, name: d.name, tin: d.tin, vrn: d.vrn || '', location: d.location || '', notes: d.notes || '' });

// The fields shared by EfdDevicesCreate and EfdDevicesUpdate. `locked` makes the serial number read-only
// (the server refuses a serial change once receipts exist on the device).
export default function EfdDeviceForm({ f, setF, fe, locked }) {
  const { t } = useTranslation('efdDevices');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.serialNo')} error={fe.serialNo}>
        <input className="input read-only:bg-slate-50" required minLength={3} maxLength={40} pattern="[A-Za-z0-9\-]+" title={t('form.serialTitle')} readOnly={locked} value={f.serialNo} onChange={set('serialNo')} />
        {locked && <p className="mt-1 text-xs">{t('form.serialLocked')}</p>}
      </Field>
      <Field label={t('form.name')} error={fe.name}><input className="input" required minLength={2} maxLength={100} placeholder={t('form.namePlaceholder')} value={f.name} onChange={set('name')} /></Field>
      <Field label={t('form.tin')} error={fe.tin}><input className="input" required minLength={5} maxLength={30} pattern="[A-Za-z0-9\-]+" title={t('form.serialTitle')} value={f.tin} onChange={set('tin')} /></Field>
      <Field label={t('form.vrn')} error={fe.vrn}><input className="input" maxLength={30} pattern="[A-Za-z0-9\-]*" title={t('form.serialTitle')} value={f.vrn} onChange={set('vrn')} /></Field>
      <div className="sm:col-span-2"><Field label={t('form.location')} error={fe.location}><input className="input" maxLength={150} value={f.location} onChange={set('location')} /></Field></div>
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={255} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

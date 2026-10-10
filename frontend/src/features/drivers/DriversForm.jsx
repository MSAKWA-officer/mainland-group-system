import { useTranslation } from 'react-i18next';
import { staffApi } from '../../api/index.js';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export const EMPTY = { fullName: '', phone: '', licenseNo: '', licenseClass: '', licenseExpiry: '', address: '', notes: '', staff: null };

// Form state -> request body (blank optional fields become null so an edit can clear them). The server upper-cases the licence number and class.
export const toBody = (f) => ({
  fullName: f.fullName.trim(), phone: f.phone.trim() || null, licenseNo: f.licenseNo.trim(), licenseClass: f.licenseClass.trim() || null,
  licenseExpiry: f.licenseExpiry, address: f.address.trim() || null, notes: f.notes.trim() || null, staffId: f.staff?.id || null,
});

// Saved driver (from the API) -> form state.
export const fromDriver = (d) => ({
  fullName: d.fullName, phone: d.phone || '', licenseNo: d.licenseNo, licenseClass: d.licenseClass || '', licenseExpiry: d.licenseExpiry || '',
  address: d.address || '', notes: d.notes || '',
  staff: d.staff ? { id: d.staff.id, label: `${d.staff.fullName} (${d.staff.code})` } : null,
});

// Active staff members for the "linked staff" picker.
const loadStaff = async (s) => (await staffApi.list({ limit: 20, isActive: 'true', ...(s && { search: s }) })).data.map((x) => ({ id: x.id, label: `${x.fullName} (${x.code})` }));

// Shared by DriversCreate and DriversUpdate. `minExpiry` is set on Create only: the server refuses a licence that has already expired
// (on Update it only checks the date when it is changed, so an unchanged old date must still be allowed to submit).
export default function DriversForm({ f, setF, fe, minExpiry }) {
  const { t } = useTranslation('drivers');
  const { can } = useAuth();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t('form.fullName')} error={fe.fullName}><input className="input" required minLength={2} maxLength={100} value={f.fullName} onChange={set('fullName')} /></Field>
      </div>
      <Field label={t('form.phone')} error={fe.phone}><input className="input" type="tel" maxLength={30} placeholder={t('form.phonePlaceholder')} value={f.phone} onChange={set('phone')} /></Field>
      <Field label={t('form.licenseNo')} error={fe.licenseNo}><input className="input" required minLength={3} maxLength={40} value={f.licenseNo} onChange={set('licenseNo')} /></Field>
      <Field label={t('form.licenseClass')} error={fe.licenseClass}><input className="input" maxLength={10} placeholder={t('form.licenseClassPlaceholder')} value={f.licenseClass} onChange={set('licenseClass')} /></Field>
      <Field label={t('form.licenseExpiry')} error={fe.licenseExpiry}><input className="input" type="date" required min={minExpiry} value={f.licenseExpiry} onChange={set('licenseExpiry')} /></Field>
      <div className="sm:col-span-2">
        <Field label={t('form.address')} error={fe.address}><input className="input" maxLength={255} value={f.address} onChange={set('address')} /></Field>
      </div>
      {can('staff.read') && (
        <div className="sm:col-span-2">
          <Field label={t('form.staff')} error={fe.staffId}>
            <Picker value={f.staff?.id} selected={f.staff} load={loadStaff} onPick={(s) => setF({ ...f, staff: s })} placeholder={t('form.staffPlaceholder')} />
          </Field>
          <p className="mt-1 text-xs">{t('form.staffHint')}</p>
        </div>
      )}
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={255} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

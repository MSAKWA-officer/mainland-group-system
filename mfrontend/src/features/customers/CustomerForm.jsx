import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import Field from '../../components/Field.jsx';
import { salespersonApi } from '../../api/index.js';
import useLoad from '../../utils/useLoad';
import { TYPES } from './CustomersList.jsx';

export const EMPTY = { name: '', type: 'INDIVIDUAL', contactPerson: '', phone: '', email: '', address: '', city: '', tin: '',
  creditLimit: '0', paymentTermsDays: '0', salespersonId: '', notes: '' };

// Maps the form to the API body: empty text becomes null, numbers become numbers.
export const toBody = (f, canAssign) => ({
  name: f.name.trim(), type: f.type,
  contactPerson: f.contactPerson.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null,
  address: f.address.trim() || null, city: f.city.trim() || null, tin: f.tin.trim() || null,
  creditLimit: Number(f.creditLimit || 0), paymentTermsDays: Number(f.paymentTermsDays || 0), notes: f.notes.trim() || null,
  ...(canAssign && { salespersonId: f.salespersonId || null }),
});

// The form fields shared by CustomersCreate and CustomersUpdate.
export default function CustomerForm({ f, setF, fe }) {
  const { t } = useTranslation('customers');
  const { can } = useAuth();
  const canAssign = can('customers.assign');
  const sps = useLoad(() => (canAssign && can('salespersons.read') ? salespersonApi.list({ isActive: 'true', limit: 100 }) : Promise.resolve(null)), [canAssign]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.name')} error={fe.name}><input className="input" required minLength={2} maxLength={150} value={f.name} onChange={set('name')} /></Field>
      <Field label={t('form.type')} error={fe.type}>
        <select className="input" value={f.type} onChange={set('type')}>{TYPES.map((k) => <option key={k} value={k}>{t(`types.${k}`)}</option>)}</select>
      </Field>
      <Field label={t('form.contactPerson')} error={fe.contactPerson}><input className="input" maxLength={100} value={f.contactPerson} onChange={set('contactPerson')} /></Field>
      <Field label={t('form.phone')} error={fe.phone}><input className="input" type="tel" maxLength={30} placeholder={t('form.phonePlaceholder')} value={f.phone} onChange={set('phone')} /></Field>
      <Field label={t('form.email')} error={fe.email}><input className="input" type="email" maxLength={150} value={f.email} onChange={set('email')} /></Field>
      <Field label={t('form.tin')} error={fe.tin}><input className="input" maxLength={30} value={f.tin} onChange={set('tin')} /></Field>
      <Field label={t('form.address')} error={fe.address}><input className="input" maxLength={255} value={f.address} onChange={set('address')} /></Field>
      <Field label={t('form.city')} error={fe.city}><input className="input" maxLength={80} value={f.city} onChange={set('city')} /></Field>
      <Field label={t('form.creditLimit')} error={fe.creditLimit}><input className="input" type="number" min="0" step="0.01" value={f.creditLimit} onChange={set('creditLimit')} /></Field>
      <Field label={t('form.paymentTerms')} error={fe.paymentTermsDays}><input className="input" type="number" min="0" max="365" step="1" value={f.paymentTermsDays} onChange={set('paymentTermsDays')} /></Field>
      {canAssign ? (
        <div className="sm:col-span-2">
          <Field label={t('form.salesperson')} error={fe.salespersonId}>
            <select className="input" value={f.salespersonId} onChange={set('salespersonId')}>
              <option value="">{t('form.notAssigned')}</option>
              {(sps.data?.data || []).map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.code})</option>)}
            </select>
          </Field>
        </div>
      ) : (
        <p className="text-sm text-black sm:col-span-2">{t('form.autoAssigned')}</p>
      )}
      <div className="sm:col-span-2">
        <Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={2000} value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </div>
  );
}

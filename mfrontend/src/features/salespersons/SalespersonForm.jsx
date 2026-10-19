import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import Field from '../../components/Field.jsx';
import { salespersonApi, userApi, warehouseApi } from '../../api/index.js';
import useLoad from '../../utils/useLoad';

export const EMPTY = { userId: '', fullName: '', phone: '', email: '', region: '', warehouseId: '', commissionRate: '0', monthlyTarget: '0' };

// Maps the form to the API body: empty text becomes null, numbers become numbers.
// canLink / canPay mirror the API: the login account and the pay fields are only sent when the user may change them.
export const toBody = (f, { canLink, canPay, canAssign, creating }) => ({
  ...(canAssign && { warehouseId: f.warehouseId || null }),
  ...(f.fullName.trim() || !creating ? { fullName: f.fullName.trim() } : {}),   // on create the name may default to the linked user's name
  phone: f.phone.trim() || null, email: f.email.trim() || null, region: f.region.trim() || null,
  ...(canLink && { userId: f.userId || null }),
  ...(canPay && { commissionRate: Number(f.commissionRate || 0), monthlyTarget: Number(f.monthlyTarget || 0) }),
});

// The form fields shared by SalespersonsCreate and SalespersonsUpdate.
export default function SalespersonForm({ f, setF, fe, selfId }) {
  const { t } = useTranslation('salespersons');
  const { can } = useAuth();
  const canLink = can('users.read');
  const canPay = can('salespersons.view_commission');
  const canAssign = can('warehouses.assign');
  const whs = useLoad(() => (canAssign ? warehouseApi.options({ all: true }) : Promise.resolve([])), [canAssign]);
  const users = useLoad(() => (canLink ? userApi.list({ status: 'ACTIVE', limit: 100 }) : Promise.resolve(null)), [canLink]);
  const sps = useLoad(() => (canLink ? salespersonApi.list({ limit: 100 }) : Promise.resolve(null)), [canLink]);
  // A login account can belong to only one salesperson, so accounts linked to someone else are disabled.
  const taken = new Set((sps.data?.data || []).filter((s) => s.id !== selfId && s.userId).map((s) => s.userId));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {canLink && (
        <div className="sm:col-span-2">
          <Field label={t('form.loginAccount')} error={fe.userId}>
            <select className="input" value={f.userId} onChange={set('userId')}>
              <option value="">{t('form.notLinked')}</option>
              {(users.data?.data || []).map((u) => (
                <option key={u.id} value={u.id} disabled={taken.has(u.id)}>
                  {u.fullName} ({u.username}{u.role ? ` · ${u.role.name}` : ''}){taken.has(u.id) ? ` — ${t('form.alreadyLinked')}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-1 text-xs text-black">{t('form.linkHint')}</p>
        </div>
      )}
      <Field label={t('form.fullName')} error={fe.fullName}>
        <input className="input" minLength={2} maxLength={100} required={!f.userId} placeholder={f.userId ? t('form.fullNameDefault') : ''} value={f.fullName} onChange={set('fullName')} />
      </Field>
      <Field label={t('form.region')} error={fe.region}><input className="input" maxLength={80} value={f.region} onChange={set('region')} /></Field>
      <Field label={t('form.phone')} error={fe.phone}><input className="input" type="tel" maxLength={30} placeholder={t('form.phonePlaceholder')} value={f.phone} onChange={set('phone')} /></Field>
      <Field label={t('form.email')} error={fe.email}><input className="input" type="email" maxLength={150} value={f.email} onChange={set('email')} /></Field>
      {canAssign && (
        <div className="sm:col-span-2">
          <Field label={t('form.warehouse')} error={fe.warehouseId}>
            <select className="input" value={f.warehouseId} onChange={set('warehouseId')}>
              <option value="">{t('form.defaultWarehouse')}</option>
              {(whs.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </Field>
          <p className="mt-1 text-xs text-black">{t('form.warehouseHint')}</p>
        </div>
      )}
      {canPay && (
        <>
          <Field label={t('form.commissionRate')} error={fe.commissionRate}><input className="input" type="number" min="0" max="100" step="0.01" value={f.commissionRate} onChange={set('commissionRate')} /></Field>
          <Field label={t('form.monthlyTarget')} error={fe.monthlyTarget}><input className="input" type="number" min="0" step="0.01" value={f.monthlyTarget} onChange={set('monthlyTarget')} /></Field>
        </>
      )}
    </div>
  );
}

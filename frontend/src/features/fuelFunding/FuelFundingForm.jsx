import { useTranslation } from 'react-i18next';
import { driverApi, vehicleApi } from '../../api/index.js';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { AccountSelect, METHOD, NEEDS_BANK, driverOption, qty, today, useAccounts, vehicleOption } from '../fuel/fuelUi.jsx';

export const EMPTY = { vehicle: null, driver: null, amount: '', litres: '', purpose: '', method: 'CASH', bankAccountId: '', reference: '', fundingDate: today(), notes: '' };

// Form state -> request body (blank optional fields become null so an edit can clear them).
// No driver key means "the vehicle's default driver" on create, and "keep the saved driver" on edit (the server cannot clear it).
export const toBody = (f) => ({
  vehicleId: f.vehicle?.id, ...(f.driver?.id && { driverId: f.driver.id }),
  amount: Number(f.amount), litres: f.litres === '' ? null : Number(f.litres), purpose: f.purpose.trim(), method: f.method,
  bankAccountId: f.bankAccountId || null, reference: f.reference.trim() || null, fundingDate: f.fundingDate || undefined, notes: f.notes.trim() || null,
});

// Saved funding (from the API) -> form state.
export const fromFunding = (r) => ({
  vehicle: r.vehicle ? vehicleOption(r.vehicle) : null, driver: r.driver ? driverOption(r.driver) : null,
  amount: String(Number(r.amount)), litres: r.litres == null ? '' : String(Number(r.litres)), purpose: r.purpose, method: r.method,
  bankAccountId: r.bankAccountId || '', reference: r.reference || '', fundingDate: r.fundingDate || today(), notes: r.notes || '',
});

const loadVehicles = async (s) => (await vehicleApi.list({ limit: 20, isActive: 'true', ...(s && { search: s }) })).data.map(vehicleOption);
const loadDrivers = async (s) => (await driverApi.list({ limit: 20, isActive: 'true', ...(s && { search: s }) })).data.map(driverOption);

// Shared by FuelFundingCreate and FuelFundingUpdate. `editing` makes the driver required, because an edit cannot go back to "the vehicle's default driver".
export default function FuelFundingForm({ f, setF, fe, editing }) {
  const { t } = useTranslation('fuelFunding');
  const accounts = useAccounts('TZS');                       // fuel funding can only be paid from TZS accounts
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const needsBank = NEEDS_BANK.includes(f.method);
  const cap = f.vehicle?.tankCapacityLitres != null ? Number(f.vehicle.tankCapacityLitres) : null;
  const overTank = cap != null && f.litres !== '' && Number(f.litres) > cap;
  const dflt = f.vehicle?.driver;                            // the vehicle's default driver (only known for a vehicle picked from the list)
  const driverHint = f.driver ? t('form.driverHintPicked')
    : dflt ? t('form.driverHintDefault', { name: dflt.fullName })
      : f.vehicle && !editing ? t('form.driverHintNoDefault') : t('form.driverHintEmpty');
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t('form.vehicle')} error={fe.vehicleId}>
          <Picker value={f.vehicle?.id} selected={f.vehicle} load={loadVehicles} onPick={(v) => setF({ ...f, vehicle: v })} placeholder={t('form.vehiclePlaceholder')} required />
        </Field>
        <p className="mt-1 text-xs">{t('form.vehicleHint')}</p>
      </div>
      <div className="sm:col-span-2">
        <Field label={editing ? t('form.driver') : t('form.driverOptional')} error={fe.driverId}>
          <Picker value={f.driver?.id} selected={f.driver} load={loadDrivers} onPick={(d) => setF({ ...f, driver: d })} required={editing}
            placeholder={editing ? t('form.driverSelect') : t('form.driverDefaultPlaceholder')} />
        </Field>
        <p className="mt-1 text-xs">{driverHint}</p>
      </div>
      <Field label={t('form.amount')} error={fe.amount}><input className="input" type="number" required min="0.01" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
      <Field label={t('form.litres')} error={fe.litres}>
        <input className="input" type="number" min="0.001" step="0.001" value={f.litres} onChange={set('litres')} />
        {overTank && <p className="mt-1 text-xs font-semibold text-red-600">{t('form.overTank', { cap: qty(cap) })}</p>}
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('form.purpose')} error={fe.purpose}><input className="input" required minLength={3} maxLength={255} placeholder={t('form.purposePlaceholder')} value={f.purpose} onChange={set('purpose')} /></Field>
      </div>
      <Field label={t('form.method')} error={fe.method}>
        <select className="input" value={f.method} onChange={set('method')}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </Field>
      <Field label={t('form.fundingDate')} error={fe.fundingDate}><input className="input" type="date" required max={today()} value={f.fundingDate} onChange={set('fundingDate')} /></Field>
      <div className="sm:col-span-2">
        <Field label={needsBank ? t('form.bankAccountRequired') : t('form.bankAccountOptional')} error={fe.bankAccountId}>
          <AccountSelect accounts={accounts.data?.data} value={f.bankAccountId} onChange={set('bankAccountId')} required={needsBank} placeholder={needsBank ? t('form.bankSelect') : t('form.bankNone')} />
        </Field>
        <p className="mt-1 text-xs">{t('form.bankHint')}</p>
      </div>
      <div className="sm:col-span-2"><Field label={t('form.reference')} error={fe.reference}><input className="input" maxLength={100} value={f.reference} onChange={set('reference')} /></Field></div>
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

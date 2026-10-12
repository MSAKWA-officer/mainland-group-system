import { useTranslation } from 'react-i18next';
import Field from '../../components/Field.jsx';
import i18n from '../../i18n';
import { fmtNum } from '../../utils/format';
import { money, today, toCents } from '../fuel/fuelUi.jsx';

export const EMPTY = { usageDate: today(), litres: '', amount: '', odometerKm: '', isFullTank: true, station: '', receiptNo: '', notes: '' };

// Form state -> request body (blank optional fields become null so an edit can clear them). The price per litre is NOT sent: the server calculates it.
export const toBody = (f) => ({
  usageDate: f.usageDate || undefined, litres: Number(f.litres), amount: Number(f.amount),
  odometerKm: f.odometerKm === '' ? null : Number(f.odometerKm), isFullTank: f.isFullTank,
  station: f.station.trim() || null, receiptNo: f.receiptNo.trim() || null, notes: f.notes.trim() || null,
});

// Saved usage (from the API) -> form state.
export const fromUsage = (u) => ({
  usageDate: u.usageDate || today(), litres: String(Number(u.litres)), amount: String(Number(u.amount)),
  odometerKm: u.odometerKm == null ? '' : String(Number(u.odometerKm)), isFullTank: !!u.isFullTank,
  station: u.station || '', receiptNo: u.receiptNo || '', notes: u.notes || '',
});

// One line that describes a funding in the drop-down (translated; text from locales/<lang>/fuelUsage.json -> fundingLeft).
const fundingLabel = (b) => i18n.t('fundingLeft', { ns: 'fuelUsage', no: b.fundingNo, plate: b.plateNo, driver: b.driverName, amount: fmtNum(b.balance, 2) });

// A balance row from the API -> an option for the funding Picker.
export const toOption = (b) => ({ ...b, id: b.id, label: fundingLabel(b) });

// Shared by FuelUsageCreate and FuelUsageUpdate. `funding` is the balance row of the chosen funding (gives the earliest date),
// `available` is the money that can still be recorded on it (a hint only; the server enforces it).
export default function FuelUsageForm({ f, setF, fe, funding, available }) {
  const { t } = useTranslation('fuelUsage');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const price = Number(f.litres) > 0 && Number(f.amount) > 0 ? money(Number(f.amount) / Number(f.litres)) : null;
  const over = available != null && f.amount !== '' && toCents(f.amount) > toCents(available);
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {available != null && (
        <p className={`text-sm sm:col-span-2 ${over ? 'font-semibold text-red-600' : ''}`}>
          {t('form.left', { amount: money(available) })}{over && t('form.over')}
        </p>
      )}
      <Field label={t('form.date')} error={fe.usageDate}><input className="input" type="date" required min={funding?.disbursedOn || undefined} max={today()} value={f.usageDate} onChange={set('usageDate')} /></Field>
      <Field label={t('form.litres')} error={fe.litres}><input className="input" type="number" required min="0.001" step="0.001" value={f.litres} onChange={set('litres')} /></Field>
      <Field label={t('form.amount')} error={fe.amount}><input className="input" type="number" required min="0.01" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
      <div className="flex items-end pb-2 text-sm">{price ? t('form.price', { price }) : t('form.priceHint')}</div>
      <Field label={t('form.odometer')} error={fe.odometerKm}><input className="input" type="number" min="0" step="0.1" value={f.odometerKm} onChange={set('odometerKm')} /></Field>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isFullTank} onChange={(e) => setF({ ...f, isFullTank: e.target.checked })} />{t('form.fullTank')}</label>
      </div>
      <Field label={t('form.station')} error={fe.station}><input className="input" maxLength={100} value={f.station} onChange={set('station')} /></Field>
      <Field label={t('form.receiptNo')} error={fe.receiptNo}><input className="input" maxLength={50} value={f.receiptNo} onChange={set('receiptNo')} /></Field>
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

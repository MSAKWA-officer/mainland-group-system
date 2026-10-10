import { useTranslation } from 'react-i18next';
import { efdDeviceApi } from '../../api/index.js';
import Field from '../../components/Field.jsx';
import useLoad from '../../utils/useLoad';
import { money, today } from '../banking/bankingUi.jsx';

// The trading day is judged in the business time zone, so "today" must be too (the server refuses future dates).
const tzToday = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Dar_es_Salaam' }); } catch { return today(); } };

export const EMPTY = { deviceId: '', reportDate: tzToday(), zNumber: '', receiptsCount: '', grossAmount: '', vatAmount: '', voidedCount: '0', voidedAmount: '0', firstReceiptNo: '', lastReceiptNo: '', notes: '' };

// Form state -> request body (blank optional fields become null so an edit can clear them). The device is only sent on create.
export const toBody = (f, { create } = {}) => ({
  ...(create && { deviceId: f.deviceId }),
  reportDate: f.reportDate, zNumber: f.zNumber.trim(), receiptsCount: Number(f.receiptsCount),
  grossAmount: Number(f.grossAmount), vatAmount: Number(f.vatAmount),
  voidedCount: Number(f.voidedCount || 0), voidedAmount: Number(f.voidedAmount || 0),
  firstReceiptNo: f.firstReceiptNo.trim() || null, lastReceiptNo: f.lastReceiptNo.trim() || null, notes: f.notes.trim() || null,
});

// Saved report (from the API) -> form state.
export const fromReport = (r) => ({
  deviceId: r.deviceId, reportDate: r.reportDate, zNumber: r.zNumber, receiptsCount: String(r.receiptsCount),
  grossAmount: String(Number(r.grossAmount)), vatAmount: String(Number(r.vatAmount)),
  voidedCount: String(r.voidedCount ?? 0), voidedAmount: String(Number(r.voidedAmount || 0)),
  firstReceiptNo: r.firstReceiptNo || '', lastReceiptNo: r.lastReceiptNo || '', notes: r.notes || '',
});

// Shared by EfdZReportsCreate and EfdZReportsUpdate. `device` is the saved device when editing (it cannot be changed).
export default function EfdZReportForm({ f, setF, fe, device }) {
  const { t } = useTranslation('efd');
  const devs = useLoad(() => (device ? Promise.resolve(null) : efdDeviceApi.list({ isActive: 'true', limit: 100 })), [!!device]);
  const devices = devs.data?.data || [];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const gross = Number(f.grossAmount || 0); const vat = Number(f.vatAmount || 0);
  const net = Math.round(gross * 100) - Math.round(vat * 100);
  const vatTooBig = f.grossAmount !== '' && f.vatAmount !== '' && vat > gross;
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t('shared.device')} error={fe.deviceId}>
          {device
            ? <input className="input" disabled value={`${device.name} (${device.serialNo})`} />
            : <select className="input" required value={f.deviceId} onChange={set('deviceId')}>
              <option value="">{t('shared.chooseDevice')}</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.serialNo})</option>)}
            </select>}
        </Field>
        {device && <p className="mt-1 text-xs">{t('z.form.deviceLocked')}</p>}
      </div>
      <Field label={t('z.form.reportDate')} error={fe.reportDate}><input className="input" type="date" required max={tzToday()} value={f.reportDate} onChange={set('reportDate')} /></Field>
      <Field label={t('z.form.zNumber')} error={fe.zNumber}>
        <input className="input" required inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} title={t('z.form.zNumberTitle')} value={f.zNumber} onChange={set('zNumber')} />
      </Field>
      <Field label={t('z.form.receiptsCount')} error={fe.receiptsCount}><input className="input" type="number" required min="0" step="1" value={f.receiptsCount} onChange={set('receiptsCount')} /></Field>
      <div />
      <Field label={t('z.form.grossAmount')} error={fe.grossAmount}><input className="input" type="number" required min="0" step="0.01" value={f.grossAmount} onChange={set('grossAmount')} /></Field>
      <Field label={t('z.form.vatAmount')} error={fe.vatAmount}>
        <input className="input" type="number" required min="0" step="0.01" value={f.vatAmount} onChange={set('vatAmount')} />
        {vatTooBig && <p className="mt-1 text-xs font-semibold text-red-600">{t('z.form.vatTooBig')}</p>}
      </Field>
      <p className="text-sm sm:col-span-2">{t('z.form.net')} <b>{money(net / 100)}</b></p>
      <Field label={t('z.form.voidedCount')} error={fe.voidedCount}><input className="input" type="number" min="0" step="1" value={f.voidedCount} onChange={set('voidedCount')} /></Field>
      <Field label={t('z.form.voidedAmount')} error={fe.voidedAmount}><input className="input" type="number" min="0" step="0.01" value={f.voidedAmount} onChange={set('voidedAmount')} /></Field>
      <Field label={t('z.form.firstReceiptNo')} error={fe.firstReceiptNo}><input className="input" maxLength={40} pattern="[A-Za-z0-9\-]*" title={t('z.form.lettersTitle')} value={f.firstReceiptNo} onChange={set('firstReceiptNo')} /></Field>
      <Field label={t('z.form.lastReceiptNo')} error={fe.lastReceiptNo}><input className="input" maxLength={40} pattern="[A-Za-z0-9\-]*" title={t('z.form.lettersTitle')} value={f.lastReceiptNo} onChange={set('lastReceiptNo')} /></Field>
      <div className="sm:col-span-2"><Field label={t('z.form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

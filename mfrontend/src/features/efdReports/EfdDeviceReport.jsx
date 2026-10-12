import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { CELL, HEAD, al, Errors, Stat, Toolbar, day, initialPeriod, money, periodError, useEfdReport } from './efdReportUi.jsx';

const COLS = ['device', 'tin', 'receipts', 'gross', 'vat', 'voided', 'lastReceipt', 'zReports', 'zVerified', 'daysReconciled'];

// Sales and VAT per EFD device over a period, with how many Z reports were recorded and verified and how many days were reconciled.
export default function EfdDeviceReport({ devices }) {
  const { t } = useTranslation('efdReports');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const [f, setF] = useState({ ...initialPeriod(), deviceId: '' });
  const err = periodError(f, t);
  const rpt = useEfdReport('devices', f, err);
  const tot = rpt.data?.totals; const rows = rpt.data?.rows || [];
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
      <Stat label={t('w.receipts')} value={tot?.receiptsCount ?? '—'} /><Stat label={t('w.gross')} value={tot ? money(tot.receiptsGross) : '—'} />
      <Stat label={t('w.vat')} value={tot ? money(tot.receiptsVat) : '—'} /><Stat label={t('w.voided')} value={tot ? `${tot.voidedCount} · ${money(tot.voidedAmount)}` : '—'} />
    </div>
    <Toolbar f={f} setF={setF} devices={devices} rpt={rpt} />
    <Errors rpt={rpt} err={err} />
    <div className="overflow-x-auto px-4 pb-4">
      <table className="w-full border-collapse bg-white">
        <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`devices.columns.${k}`)}</th>)}</tr></thead>
        <tbody>
          {rpt.loading && !rpt.data && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{tc('loading')}</td></tr>}
          {!rpt.loading && rpt.data && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{t('devices.empty')}</td></tr>}
          {rows.map((r) => (
            <tr key={r.deviceId} className={`bg-white ${r.isActive ? '' : 'text-slate-500'}`}>
              <td className={`${CELL} text-left`}>{can('efd_devices.read') ? <Link to={`/efd-devices/${r.deviceId}`} className="underline">{r.deviceName}</Link> : r.deviceName}<div className="text-xs">{r.deviceSerial}{r.isActive ? '' : ` · ${t('devices.inactive')}`}</div></td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{r.tin || '—'}</td>
              <td className={`${CELL} text-center`}>{r.receiptsCount}</td>
              <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{money(r.receiptsGross)}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.receiptsVat)}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{r.voidedCount > 0 ? `${r.voidedCount} · ${money(r.voidedAmount)}` : '—'}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{r.lastReceiptDate ? day(r.lastReceiptDate) : '—'}</td>
              <td className={`${CELL} text-center`}>{r.zReports}</td>
              <td className={`${CELL} text-center`}>{r.zVerified}</td>
              <td className={`${CELL} text-center`}>{r.daysReconciled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>);
}

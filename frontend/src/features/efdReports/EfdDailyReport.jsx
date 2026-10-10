import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Variance } from '../efdReconciliations/reconUi.jsx';
import { CELL, HEAD, al, Errors, Stat, Toolbar, day, initialPeriod, money, periodError, useEfdReport } from './efdReportUi.jsx';

const COLS = ['date', 'device', 'receipts', 'systemGross', 'systemVat', 'voided', 'zReport', 'zGross', 'zVat', 'grossDiff', 'vatDiff', 'countDiff', 'reconciliation', 'result'];

// Per device and day: what the system recorded, what the Z report says, the difference, and whether the day was reconciled.
export default function EfdDailyReport({ devices }) {
  const { t } = useTranslation('efdReports');
  const { t: te } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const [f, setF] = useState({ ...initialPeriod(), deviceId: '' });
  const [only, setOnly] = useState(false);
  const err = periodError(f, t);
  const rpt = useEfdReport('daily', f, err);
  const tot = rpt.data?.totals;
  const rows = (rpt.data?.rows || []).filter((r) => !only || r.hasDifference);
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label={t('daily.deviceDays')} value={tot?.days ?? '—'} /><Stat label={t('w.receipts')} value={tot?.receiptsCount ?? '—'} />
      <Stat label={t('w.gross')} value={tot ? money(tot.receiptsGross) : '—'} /><Stat label={t('w.vat')} value={tot ? money(tot.receiptsVat) : '—'} />
      <Stat label={t('w.voided')} value={tot ? `${tot.voidedCount} · ${money(tot.voidedAmount)}` : '—'} />
      <Stat label={t('daily.daysWithDiff')} value={tot?.daysWithDifference ?? '—'} tone={tot?.daysWithDifference > 0 ? 'text-red-600' : ''} />
    </div>
    <Toolbar f={f} setF={setF} devices={devices} rpt={rpt}>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />{t('daily.onlyDiff')}</label>
    </Toolbar>
    <Errors rpt={rpt} err={err} />
    <p className="px-4 pb-3 text-[14px]">{t('daily.note')}</p>
    <div className="overflow-x-auto px-4 pb-4">
      <table className="w-full border-collapse bg-white">
        <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`daily.columns.${k}`)}</th>)}</tr></thead>
        <tbody>
          {rpt.loading && !rpt.data && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{tc('loading')}</td></tr>}
          {!rpt.loading && rpt.data && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{only ? t('daily.emptyOnly') : t('daily.emptyNone')}</td></tr>}
          {rows.map((r) => {
            const noZ = !r.zReportNo;
            return (
              <tr key={`${r.date}${r.deviceId}`} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{day(r.date)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.deviceSerial}</td>
                <td className={`${CELL} text-center`}>{r.receiptsCount}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.receiptsGross)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.receiptsVat)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.voidedCount > 0 ? `${r.voidedCount} · ${money(r.voidedAmount)}` : '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{noZ ? '—' : <>{r.zReportNo}<div className="text-xs">{t('daily.zLine', { z: r.zNumber, status: te(`z.status.${r.zStatus}`, { defaultValue: r.zStatus }) })}</div></>}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{noZ ? '—' : money(r.zGross)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{noZ ? '—' : money(r.zVat)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{noZ ? '—' : <Variance v={r.grossDifference} />}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{noZ ? '—' : <Variance v={r.vatDifference} />}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{noZ ? '—' : <Variance v={r.countDifference} count />}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.reconNo ? <>{r.reconNo}<div className="text-xs">{te(`recon.status.${r.reconStatus}`, { defaultValue: r.reconStatus })}</div></> : '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{noZ && r.receiptsCount > 0 ? <b className="text-red-600">{t('daily.noZ')}</b> : r.hasDifference ? <b className="text-red-600">{t('daily.difference')}</b> : <span className="text-black">{noZ ? '—' : t('daily.ok')}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </>);
}

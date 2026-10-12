import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CELL, HEAD, al, Errors, Stat, Toolbar, money, monthName, tzToday, useEfdReport } from './efdReportUi.jsx';

const THIS_YEAR = Number(tzToday().slice(0, 4));
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i);
// The empty key is the little bar chart column: it has no title.
const COLS = ['month', 'receipts', 'gross', '', 'vat', 'net', 'voided', 'zVerified', 'zGross', 'zVat', 'daysReconciled'];

// Month by month for one year: sales and VAT from the receipts, next to the verified Z report totals (useful for VAT returns).
export default function EfdMonthlyReport({ devices }) {
  const { t } = useTranslation('efdReports');
  const { t: tc } = useTranslation('common');
  const [f, setF] = useState({ year: String(THIS_YEAR), deviceId: '' });
  const rpt = useEfdReport('monthly', f);
  const tot = rpt.data?.totals; const rows = rpt.data?.rows || [];
  const max = Math.max(1, ...rows.map((r) => Number(r.receiptsGross)));
  const bold = `${CELL} text-center !font-semibold`;
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
      <Stat label={t('w.gross')} value={tot ? money(tot.receiptsGross) : '—'} /><Stat label={t('w.vat')} value={tot ? money(tot.receiptsVat) : '—'} />
      <Stat label={t('w.net')} value={tot ? money(tot.receiptsNet) : '—'} /><Stat label={t('monthly.verifiedZVat')} value={tot ? money(tot.zVat) : '—'} />
    </div>
    <Toolbar f={f} setF={setF} devices={devices} rpt={rpt} period={false}>
      <select className="input max-w-[8rem] !text-[14px] !text-[#212121]" aria-label={t('toolbar.yearAria')} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
    </Toolbar>
    <Errors rpt={rpt} />
    <div className="overflow-x-auto px-4 pb-4">
      <table className="w-full border-collapse bg-white">
        <thead><tr>{COLS.map((k, i) => <th key={`${k}${i}`} className={`${HEAD} ${al(i)}`}>{k ? t(`monthly.columns.${k}`) : ''}</th>)}</tr></thead>
        <tbody>
          {rpt.loading && !rpt.data && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{tc('loading')}</td></tr>}
          {rows.map((r) => (
            <tr key={r.month} className="bg-white">
              <td className={`${CELL} whitespace-nowrap text-left`}>{monthName(rpt.data.year, r.month)}</td>
              <td className={`${CELL} text-center`}>{r.receiptsCount || '—'}</td>
              <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{Number(r.receiptsGross) > 0 ? money(r.receiptsGross) : '—'}</td>
              <td className={`${CELL} w-32 text-center`}><div className="h-2 rounded bg-brand" style={{ width: `${(Number(r.receiptsGross) / max) * 100}%` }} role="presentation" /></td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.receiptsVat) > 0 ? money(r.receiptsVat) : '—'}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.receiptsNet) > 0 ? money(r.receiptsNet) : '—'}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{r.voidedCount > 0 ? `${r.voidedCount} · ${money(r.voidedAmount)}` : '—'}</td>
              <td className={`${CELL} text-center`}>{r.zVerified || '—'}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.zGross) > 0 ? money(r.zGross) : '—'}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.zVat) > 0 ? money(r.zVat) : '—'}</td>
              <td className={`${CELL} text-center`}>{r.daysReconciled || '—'}</td>
            </tr>
          ))}
        </tbody>
        {tot && (
          <tfoot><tr className="bg-white">
            <td className={`${CELL} text-left !font-semibold`}>{t('monthly.total', { year: rpt.data.year })}</td><td className={bold}>{tot.receiptsCount}</td>
            <td className={`${bold} whitespace-nowrap`}>{money(tot.receiptsGross)}</td><td className={bold} />
            <td className={`${bold} whitespace-nowrap`}>{money(tot.receiptsVat)}</td><td className={`${bold} whitespace-nowrap`}>{money(tot.receiptsNet)}</td>
            <td className={`${bold} whitespace-nowrap`}>{tot.voidedCount} · {money(tot.voidedAmount)}</td><td className={bold} />
            <td className={`${bold} whitespace-nowrap`}>{money(tot.zGross)}</td><td className={`${bold} whitespace-nowrap`}>{money(tot.zVat)}</td><td className={bold} />
          </tr></tfoot>
        )}
      </table>
    </div>
  </>);
}

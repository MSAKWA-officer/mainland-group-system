import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { CELL, HEAD, al, Empty, Errors, Stat, Toolbar, day, initialPeriod, money, periodError, useEfdReport } from './efdReportUi.jsx';

const COLS = ['confirmedOn', 'order', 'customer', 'customerTin', 'total', 'vat', 'age', 'goTo'];

// Confirmed orders that still have no live EFD receipt. Orders do not belong to a device, so there is no device filter.
export default function EfdUnreceiptedReport() {
  const { t } = useTranslation('efdReports');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const [f, setF] = useState(initialPeriod());
  const err = periodError(f, t);
  const rpt = useEfdReport('unreceipted', f, err);
  const tot = rpt.data?.totals; const rows = rpt.data?.rows || [];
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
      <Stat label={t('unreceipted.orders')} value={tot?.count ?? '—'} tone={tot?.count > 0 ? 'text-red-600' : ''} />
      <Stat label={t('w.total')} value={tot ? money(tot.total) : '—'} /><Stat label={t('w.vat')} value={tot ? money(tot.vatAmount) : '—'} />
    </div>
    <Toolbar f={f} setF={setF} rpt={rpt} device={false} />
    <Errors rpt={rpt} err={err} />
    <div className="overflow-x-auto px-4 pb-4">
      <table className="w-full border-collapse bg-white">
        <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`unreceipted.columns.${k}`)}</th>)}</tr></thead>
        <tbody>
          {rpt.loading && !rpt.data && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{tc('loading')}</td></tr>}
          <Empty cols={COLS.length} rpt={rpt}>{t('unreceipted.empty')}</Empty>
          {rows.map((r) => (
            <tr key={r.orderId} className="bg-white">
              <td className={`${CELL} whitespace-nowrap text-left`}>{day(r.date)}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{can('sales_orders.read') ? <Link to={`/sales-orders/${r.orderId}`} className="underline">{r.orderNo}</Link> : r.orderNo}</td>
              <td className={`${CELL} text-center`}>{r.customerName}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{r.customerTin || '—'}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.total)}</td>
              <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.vatAmount)}</td>
              <td className={`${CELL} text-center`}>{r.ageDays >= 2 ? <b className="text-red-600">{r.ageDays}</b> : <span className="text-black">{r.ageDays}</span>}</td>
              <td className={`${CELL} text-center`}>{can('efd_receipts.create') ? <Link to={`/efd-receipts/new?orderId=${r.orderId}`} className="whitespace-nowrap text-[14px] underline">{t('unreceipted.record')}</Link> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>);
}

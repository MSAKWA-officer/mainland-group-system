import { useState } from 'react';
import { Link } from 'react-router-dom';
import { efdDeviceApi, efdDifferenceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { RefreshIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { PagerBar } from '../banking/bankingUi.jsx';
import { NOTICE, Variance, day, money, tzToday } from '../efdReconciliations/reconUi.jsx';

const SEV = { HIGH: ['High', 'bg-red-500'], MEDIUM: ['Medium', 'bg-amber-500'], LOW: ['Low', 'bg-slate-400'] };
const MAX_DAYS = 92;
const LABEL = { receiptsCount: 'Receipts', grossAmount: 'Gross', vatAmount: 'VAT', zNumber: 'Z no', receiptNo: 'Receipt no', missingCount: 'Missing' };
const COUNTS = ['receiptsCount', 'missingCount'];
const MONEY = ['grossAmount', 'vatAmount'];

const Sev = ({ s }) => {
  const [label, dot] = SEV[s] || [s, 'bg-slate-400'];
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{label}</span>;
};

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const span = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

// What the records say (expected) or what was found (actual): "Receipts 3 · Gross 1,234.00".
const Facts = ({ v }) => {
  if (!v) return <span>—</span>;
  const parts = Object.entries(v).filter(([, x]) => x !== null && x !== undefined && x !== '');
  if (!parts.length) return <span>—</span>;
  return <>{parts.map(([k, x], i) => <div key={k} className="whitespace-nowrap">{LABEL[k] || k} <b>{MONEY.includes(k) ? money(x) : x}</b></div>)}</>;
};
// Signed differences, red when not zero.
const Gap = ({ v }) => {
  if (!v) return <span>—</span>;
  const parts = Object.entries(v);
  return <>{parts.map(([k, x]) => <div key={k} className="whitespace-nowrap">{LABEL[k] || k} {k === 'missingCount' ? <b className="text-red-600">{x}</b> : <Variance v={x} count={COUNTS.includes(k)} />}</div>)}</>;
};

// Where to go next for one finding. Only links the user may open are shown.
function Next({ x }) {
  const { can } = useAuth();
  const L = ({ to, children }) => <Link to={to} className="whitespace-nowrap text-black underline">{children}</Link>;
  const r = x.refs || {};
  const links = [];
  if (r.zReportId && can('efd_z_reports.read')) links.push(<L key="z" to={`/efd-z-reports/${r.zReportId}`}>Z report {r.reportNo}</L>);
  if (r.reconId && can('efd_reconciliations.read')) links.push(<L key="c" to={`/efd-reconciliations/${r.reconId}`}>{r.reconNo}</L>);
  if (r.receiptId && can('efd_receipts.read')) links.push(<L key="r" to={`/efd-receipts/${r.receiptId}`}>Receipt {r.receiptNo}</L>);
  if (r.orderId && can('sales_orders.read')) links.push(<L key="o" to={`/sales-orders/${r.orderId}`}>Order {r.orderNo}</L>);
  if (r.orderId && x.type === 'UNRECEIPTED_ORDER' && can('efd_receipts.create')) links.push(<L key="n" to={`/efd-receipts/new?orderId=${r.orderId}`}>Record EFD number</L>);
  if (x.type === 'Z_MISSING' && x.deviceId && can('efd_z_reports.create')) links.push(<L key="zn" to={`/efd-z-reports/new?deviceId=${x.deviceId}`}>Record Z report</L>);
  if (x.type === 'RECON_MISSING' && x.deviceId && can('efd_reconciliations.create')) links.push(<L key="rn" to={`/efd-reconciliations/new?deviceId=${x.deviceId}&date=${x.date}`}>Start reconciliation</L>);
  if (!links.length) return <span>—</span>;
  return <div className="flex flex-col gap-1 text-sm">{links}</div>;
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function EfdDifferencesPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ from: '', to: '', deviceId: '', type: '', severity: '' });     // blank dates = the server default (last 30 days)
  const canFilterDevice = can('efd_devices.read');
  const meta = useLoad(() => efdDifferenceApi.types().catch(() => null), []);
  const devs = useLoad(() => (canFilterDevice ? efdDeviceApi.list({ limit: 100 }) : Promise.resolve(null)), [canFilterDevice]);
  const rangeErr = f.from && f.to && f.from > f.to ? '“From” must not be after “To”.'
    : f.from && f.to && span(f.from, f.to) > MAX_DAYS ? `Scan at most ${MAX_DAYS} days at a time.` : '';
  const scan = useLoad(() => (rangeErr ? Promise.resolve(null) : efdDifferenceApi.scan({ page, limit: 25, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })), [page, f, rangeErr]);
  const d = scan.data;
  const rows = d?.data || []; const total = d?.total || 0; const limit = d?.limit || 25;
  const sum = d?.summary; const typeLabel = Object.fromEntries((meta.data?.types || []).map((t) => [t.code, t.label]));
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const pick = (k, v) => { setF({ ...f, [k]: f[k] === v ? '' : v }); setPage(1); };
  const range = (days) => { const to = tzToday(); setF({ ...f, from: addDays(to, -(days - 1)), to }); setPage(1); };
  const filtered = f.deviceId || f.type || f.severity;
  const heads = ['Severity', 'Type', 'Date', 'Device', 'What was found', 'Expected', 'Actual', 'Difference', 'Go to'];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">Difference detection</h1>
          <p className="mt-0.5 text-[14px]">A read-only scan of the fiscal records for things that do not add up: missing or mismatched Z reports, skipped numbers, orders without receipts and days that were never reconciled. Nothing is changed by the scan.</p>
        </div>
        <button type="button" className="btn-ghost gap-2" onClick={scan.reload} disabled={scan.loading}><RefreshIcon />{scan.loading ? 'Scanning…' : 'Scan again'}</button>
      </div>

      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
        {[['', 'All findings', sum?.total]].concat(['HIGH', 'MEDIUM', 'LOW'].map((s) => [s, `${SEV[s][0]} severity`, sum?.bySeverity?.[s]])).map(([k, label, n]) => (
          <button key={k || 'all'} type="button" onClick={() => (k ? pick('severity', k) : setF({ ...f, severity: '' }))}
            className={`rounded-md border p-4 text-left transition hover:bg-slate-50 ${(f.severity || '') === k ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}>
            <div className="text-xs uppercase">{label}</div>
            <div className={`mt-1 text-xl font-semibold ${k === 'HIGH' && n > 0 ? 'text-red-600' : ''}`}>{n ?? '—'}</div>
          </button>
        ))}
      </div>
      {sum && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {Object.entries(sum.byType).map(([code, n]) => (
            <button key={code} type="button" onClick={() => pick('type', code)} title="Show only this kind of finding"
              className={`rounded-full border px-3 py-1 text-xs transition hover:bg-slate-50 ${f.type === code ? 'border-brand bg-emerald-50' : 'border-line'} ${n === 0 ? 'text-slate-500' : 'text-black'}`}>
              {typeLabel[code] || code}: <b>{n}</b>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <label className="flex items-center gap-2 text-[14px]">From <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || tzToday()} onChange={set('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">To <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} max={tzToday()} onChange={set('to')} /></label>
        <button type="button" className="btn-ghost" onClick={() => range(7)}>Last 7 days</button>
        <button type="button" className="btn-ghost" onClick={() => range(30)}>Last 30 days</button>
        <button type="button" className="btn-ghost" onClick={() => range(MAX_DAYS)}>Last {MAX_DAYS} days</button>
        {canFilterDevice && (
          <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label="Filter by device" value={f.deviceId} onChange={set('deviceId')}>
            <option value="">All devices</option>{(devs.data?.data || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.serialNo})</option>)}
          </select>
        )}
        <select className="input max-w-[18rem] !text-[14px] !text-[#212121]" aria-label="Filter by type" value={f.type} onChange={set('type')}>
          <option value="">All kinds of finding</option>{(meta.data?.types || []).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
        {filtered && <button type="button" className="btn-ghost" onClick={() => { setF({ ...f, deviceId: '', type: '', severity: '' }); setPage(1); }}>Clear filters</button>}
      </div>

      <div className={`px-4 ${NOTICE}`}>
        <Banner>{rangeErr || scan.error}</Banner>
        {d?.capped && <Banner>One kind of finding hit the limit of 5,000, so the counts are not complete. Narrow the dates or pick a device.</Banner>}
        {f.deviceId && (!f.type || f.type === 'UNRECEIPTED_ORDER') && <Banner kind="ok">Orders do not belong to a device, so “Confirmed order without an EFD receipt” is not checked while one device is selected.</Banner>}
      </div>
      {d && <p className="px-4 pb-3 text-[14px]">Scanned {day(d.from)} to {day(d.to)} (time zone {d.timezone}) · {fmt(d.generatedAt)}. Expected is what the records say it should be; Actual is what was found; Difference is Actual minus Expected.</p>}

      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {scan.loading && !d && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>Scanning the records…</td></tr>}
            {!scan.loading && d && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{sum?.total === 0 ? 'No differences found for this period. Everything adds up.' : 'No findings match your filters.'}</td></tr>}
            {rows.map((x) => (
              <tr key={x.key} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}><Sev s={x.severity} /></td>
                <td className={`${CELL} text-center`}>{x.typeLabel}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(x.date)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{x.deviceSerial || '—'}</td>
                <td className={`${CELL} text-center`}>{x.message}{x.ageDays != null && <div className="text-xs">{x.ageDays} day(s) old</div>}</td>
                <td className={`${CELL} text-center`}><Facts v={x.expected} /></td>
                <td className={`${CELL} text-center`}><Facts v={x.actual} /></td>
                <td className={`${CELL} text-center`}><Gap v={x.difference} /></td>
                <td className={`${CELL} text-center`}><Next x={x} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PagerBar page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

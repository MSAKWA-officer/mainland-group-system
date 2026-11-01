import { currentLocale } from '../../utils/locale';
import { day, money } from '../efdReconciliations/reconUi.jsx';

// Shared by the Payments reports and Customer balance reports pages (same look as the Sales reports page and the Excel / PDF files).
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const span = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
export const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== false));
const num = (v, max = 0) => Number(v || 0).toLocaleString(currentLocale(), { maximumFractionDigits: max });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BODY = 'border border-black bg-white px-2 py-1.5 text-left';
const SHADED = new Set(['total', 'balance']);

export const cell = (c, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (c.type === 'money') return money(v);
  if (c.type === 'count') return num(v);
  if (c.type === 'qty') return num(v, 3);
  return DATE.test(v) ? day(v) : v;
};

// data = the report as returned by the API; head(c) = translated column title.
export function ReportTable({ data, loading, head, empty, totalLabel, loadingLabel }) {
  const columns = data?.columns || []; const rows = data?.rows || [];
  const align = (c) => (c.type === 'text' ? 'text-left' : 'text-right');
  const shade = (c) => (SHADED.has(c.key) ? '!bg-[#EAF2F8]' : '');
  return (
    <div className="overflow-x-auto px-4 pb-4">
      <div className="bg-[#17365D] py-2 text-center text-[16px] font-bold text-white">{data?.reportTitle || '\u00A0'}</div>
      <table className="w-full border-collapse bg-white">
        <thead><tr>{columns.map((c) => <th key={c.key} className="whitespace-nowrap border border-black bg-[#1F4E78] px-2 py-2.5 text-center text-[14px] font-bold text-white">{head(c)}</th>)}</tr></thead>
        <tbody>
          {loading && !data && <tr><td className={BODY} colSpan={9}>{loadingLabel}</td></tr>}
          {!loading && data && rows.length === 0 && <tr><td className={BODY} colSpan={columns.length}>{empty}</td></tr>}
          {rows.map((r, i) => <tr key={i} className="bg-white">{columns.map((c) => <td key={c.key} className={`${BODY} whitespace-nowrap ${align(c)} ${shade(c)}`}>{cell(c, r[c.key])}</td>)}</tr>)}
          {data && rows.length > 0 && (
            <tr className="font-bold">
              {columns.map((c, i) => <td key={c.key} className={`${BODY} whitespace-nowrap ${align(c)} ${shade(c)}`}>{i === 0 ? totalLabel : (data.totals?.[c.key] !== undefined ? cell(c, data.totals[c.key]) : '')}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

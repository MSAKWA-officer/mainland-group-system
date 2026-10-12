import { Link } from 'react-router-dom';
import { creditSaleApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, money } from '../sales/saleUi.jsx';

const COLS = [['notDue', 'Not due'], ['days1to30', '1–30 days'], ['days31to60', '31–60 days'], ['days61to90', '61–90 days'], ['over90', 'Over 90 days']];

// What each customer still owes, by how late it is. Users without credit_sales.read_all only see their own customers' balances.
export default function ReceivablesList() {
  const q = useLoad(() => creditSaleApi.receivables(), []);
  const rows = q.data?.data || [];
  const sum = (k) => rows.reduce((a, r) => a + Math.round(Number(r[k]) * 100), 0) / 100;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Receivables</h1>
          <p className="mt-1 text-sm">Unpaid balances of completed credit sales, by days past due date.</p>
        </div>
        <Link to="/credit-sales" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />Back to credit sales</Link>
      </div>
      {q.error && <div className={`px-6 ${NOTICE}`}><Banner>{q.error}</Banner></div>}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{['Customer', 'Open sales', ...COLS.map((c) => c[1]), 'Outstanding', 'Credit limit'].map((h) => <th key={h} className="th px-6 py-3 font-normal uppercase text-black">{h}</th>)}</tr></thead>
          <tbody>
            {!q.loading && rows.length === 0 && <tr><td className="td px-6 text-black" colSpan={9}>Nothing outstanding.</td></tr>}
            {rows.map((r) => (
              <tr key={r.customerId} className="odd:bg-slate-50/60">
                <td className="td px-6 text-black"><Link className="underline" to={`/credit-sales?customerId=${r.customerId}`}>{r.name}</Link><div className="text-xs">{r.code}</div></td>
                <td className="td px-6 text-black">{r.openSales}</td>
                {COLS.map(([k]) => <td key={k} className={`td whitespace-nowrap px-6 text-right ${k !== 'notDue' && Number(r[k]) > 0 ? 'font-semibold text-red-600' : 'text-black'}`}>{Number(r[k]) > 0 ? money(r[k]) : '—'}</td>)}
                <td className="td whitespace-nowrap px-6 text-right font-semibold text-black">{money(r.outstanding)}</td>
                <td className="td whitespace-nowrap px-6 text-right text-black">{money(r.creditLimit)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-slate-50 font-semibold">
                <td className="td px-6 text-black" colSpan={2}>Total</td>
                {COLS.map(([k]) => <td key={k} className="td whitespace-nowrap px-6 text-right text-black">{money(sum(k))}</td>)}
                <td className="td whitespace-nowrap px-6 text-right text-black">{money(sum('outstanding'))}</td><td className="td" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

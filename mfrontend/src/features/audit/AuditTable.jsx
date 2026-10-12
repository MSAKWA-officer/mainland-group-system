import { Fragment, useState } from 'react';
import Pill from '../../components/Pill.jsx';
import Pager from '../../components/Pager.jsx';
import { fmt } from '../../utils/format';

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function AuditTable({ result, page, setPage }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{['When', 'User', 'Action', 'Record', 'Outcome', 'IP'].map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {result && (result.data || []).length === 0 && <tr><td className={`${CELL} text-left`} colSpan={6}>No audit entries match.</td></tr>}
            {(result?.data || []).map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer bg-white hover:bg-[#f9fafb]" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className={`${CELL} whitespace-nowrap text-left`}>{fmt(r.occurredAt)}</td>
                  <td className={`${CELL} text-center`}>{r.username || '—'}</td>
                  <td className={`${CELL} text-center`}>{r.action}</td>
                  <td className={`${CELL} text-center`}>{r.entityType}<div className="text-xs">{r.entityId}</div></td>
                  <td className={`${CELL} text-center`}><Pill tone={r.outcome === 'SUCCESS' ? 'ok' : r.outcome === 'DENIED' ? 'bad' : 'warn'}>{r.outcome}</Pill></td>
                  <td className={`${CELL} text-center`}>{r.ip}</td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={6} className="border border-[#e5e7eb] bg-[#f9fafb] p-3 text-[14px]">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div><div className="mb-1 font-semibold">Before</div><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(r.oldValues, null, 2) || '—'}</pre></div>
                      <div><div className="mb-1 font-semibold">After</div><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(r.newValues, null, 2) || '—'}</pre></div>
                    </div>
                    {r.reason && <p className="mt-2"><b>Reason:</b> {r.reason}</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {result && <Pager page={page} total={result.total} limit={result.limit} set={setPage} />}
    </>
  );
}

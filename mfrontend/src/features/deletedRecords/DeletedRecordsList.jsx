import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deletedRecordApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';

const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const FIELD = 'input !text-[14px] !text-[#212121]';
const TYPES = ['RECEIVING', 'ADJUSTMENT', 'REJECT_IN', 'REJECT_OUT', 'EXPIRED', 'DAMAGED', 'CASH_SALE'];
const EMPTY = { type: '', search: '', from: '', to: '' };

// Owner-only. Everything users deleted stays in the database for audit; this page is where the Owner can see it.
export default function DeletedRecordsList() {
  const { t } = useTranslation('deletedRecords');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(EMPTY);
  const [applied, setApplied] = useState({});
  const list = useLoad(() => deletedRecordApi.list({ ...applied, page }), [page, applied]);
  const result = list.data; const rows = result?.data || [];
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  const apply = (e) => { e.preventDefault(); setPage(1); setApplied(Object.fromEntries(Object.entries(q).filter(([, v]) => v))); };
  const reset = () => { setQ(EMPTY); setApplied({}); setPage(1); };
  const heads = ['docNo', 'type', 'date', 'warehouse', 'deletedBy', 'deletedAt', 'reason'];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle', { total: result?.total ?? 0 })}</p>
      </div>
      <form onSubmit={apply} className="grid gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-6">
        <input className={FIELD} placeholder={t('search')} aria-label={t('search')} value={q.search} onChange={set('search')} />
        <select className={FIELD} aria-label={t('type')} value={q.type} onChange={set('type')}>
          <option value="">{t('allTypes')}</option>
          {TYPES.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}
        </select>
        <input className={FIELD} type="date" aria-label={t('from')} value={q.from} max={q.to || undefined} onChange={set('from')} />
        <input className={FIELD} type="date" aria-label={t('to')} value={q.to} min={q.from || undefined} onChange={set('to')} />
        <button className="btn-primary text-[14px] font-bold">{t('filter')}</button>
        <button type="button" className="btn-ghost text-[14px]" onClick={reset}>{t('reset')}</button>
      </form>
      <div className="px-4"><Banner>{list.error}</Banner></div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${i === 0 ? 'text-left' : 'text-center'}`}>{t(`heads.${h}`)}</th>)}</tr></thead>
          <tbody>
            {result && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{t('empty')}</td></tr>}
            {rows.map((r) => (
              <tr key={`${r.type}-${r.id}`} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.docNo}</td>
                <td className={`${CELL} text-center`}>{t(`types.${r.type}`, { defaultValue: r.type })}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.recordDate || '—'}</td>
                <td className={`${CELL} text-center`}>{r.warehouse || '—'}</td>
                <td className={`${CELL} text-center`}>{r.deletedBy || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{fmt(r.deletedAt)}</td>
                <td className={`${CELL} text-center`}>{r.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result && <Pager page={page} total={result.total} limit={result.limit} set={setPage} />}
    </div>
  );
}

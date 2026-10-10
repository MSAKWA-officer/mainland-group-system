import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { creditAgeingApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { EyeIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, day, money } from '../sales/saleUi.jsx';
import { BUCKETS, Stat, today } from '../customerReports/reportUi.jsx';

// Outstanding credit by days past due date. Users without credit_ageing.read_all only see their own customers' invoices.
// Bucket codes and field names come from the shared BUCKETS list; the labels are translated here (ageing bucket.<CODE>).
// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

// Pager with translated labels (the shared PagerBar has English text built in).
const Pager = ({ page, total, limit, set }) => {
  const { t: tc } = useTranslation('common');
  return (
    <div className="flex items-center justify-between px-6 py-3 text-sm text-black">
      <span>{tc('records', { total })}</span>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => set(page - 1)}>{tc('previous')}</button>
        <button className="btn-ghost" disabled={page * limit >= total} onClick={() => set(page + 1)}>{tc('next')}</button>
      </div>
    </div>
  );
};

export default function CreditAgeingList() {
  const { t } = useTranslation('creditAgeing');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [asOf, setAsOf] = useState(''); const [bucket, setBucket] = useState(''); const [sortBy, setSortBy] = useState('outstanding');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => creditAgeingApi.list({ page, limit: 25, sortBy, sortDir: sortBy === 'name' ? 'asc' : 'desc',
    ...(q && { search: q }), ...(asOf && { asOf }), ...(bucket && { bucket }) }), [page, q, asOf, bucket, sortBy]);
  const rows = list.data?.data || []; const sum = list.data?.summary;
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const detail = (id) => `/credit-ageing/${id}${asOf ? `?asOf=${asOf}` : ''}`;
  const filtered = q || asOf || bucket;
  const heads = [t('columns.customer'), t('columns.openSales'), ...BUCKETS.map((b) => t(`bucket.${b.code}`)), t('columns.outstanding'), t('columns.oldest'), t('columns.actions')];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{asOf ? t('subtitleAsOf', { date: day(asOf) }) : t('subtitle')}</p>
      </div>
      {sum && (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t('outstanding')} value={money(sum.outstanding)} />
          {BUCKETS.map((b) => <Stat key={b.key} label={t(`bucket.${b.code}`)} value={money(sum[b.key])} tone={b.key !== 'current' && Number(sum[b.key]) > 0 ? 'text-red-600' : ''} />)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[16rem] !text-[14px] !text-[#212121]" aria-label={t('bucketAria')} value={bucket} onChange={(e) => { setBucket(e.target.value); setPage(1); }}>
          <option value="">{t('allCustomers')}</option>{BUCKETS.map((b) => <option key={b.code} value={b.code}>{t(`bucketFilter.${b.code}`)}</option>)}
        </select>
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('sortAria')} value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
          <option value="outstanding">{t('sort.outstanding')}</option><option value="over90">{t('sort.over90')}</option>
          <option value="oldest">{t('sort.oldest')}</option><option value="name">{t('sort.name')}</option>
        </select>
        <label className="flex items-center gap-2 text-[14px]">{t('asOf')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={asOf} max={today()} onChange={(e) => { setAsOf(e.target.value); setPage(1); }} /></label>
        {asOf && <button type="button" className="btn-ghost" onClick={() => { setAsOf(''); setPage(1); }}>{t('backToToday')}</button>}
      </div>
      {list.error && <div className={`px-4 ${NOTICE}`}><Banner>{list.error}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={i} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{filtered ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.customerId} className="bg-white">
                <td className={`${CELL} text-left`}>{r.name}<div className="text-xs">{r.code}</div></td>
                <td className={`${CELL} text-center`}>{r.openSales}</td>
                {BUCKETS.map((b) => <td key={b.key} className={`${CELL} whitespace-nowrap text-center ${b.key !== 'current' && Number(r[b.key]) > 0 ? '!font-semibold !text-red-600' : ''}`}>{Number(r[b.key]) > 0 ? money(r[b.key]) : '—'}</td>)}
                <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{money(r.outstanding)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.oldestDays > 0 ? t('days', { n: r.oldestDays }) : t('notDue')}</td>
                <td className={`${CELL} text-center`}>
                  <Link to={detail(r.customerId)} title={t('viewTitle')} aria-label={t('viewAria', { name: r.name })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><EyeIcon /></Link>
                </td>
              </tr>
            ))}
            {rows.length > 0 && sum && (
              <tr className="bg-white">
                <td className={`${CELL} text-left !font-semibold`} colSpan={2}>{t('totalRow', { count: sum.customers })}</td>
                {BUCKETS.map((b) => <td key={b.key} className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{money(sum[b.key])}</td>)}
                <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{money(sum.outstanding)}</td><td className={`${CELL} text-center !font-semibold`} colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

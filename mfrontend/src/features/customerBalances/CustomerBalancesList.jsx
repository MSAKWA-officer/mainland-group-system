import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { customerBalanceApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { EyeIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, day, money } from '../sales/saleUi.jsx';
import { Stat } from '../customerReports/reportUi.jsx';

// What each customer owes now. Users without customer_balances.read_all only see their own customers.
// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['customer', 'openSales', 'balance', 'overdue', 'creditLimit', 'available', 'lastPayment', 'actions'];

export default function CustomerBalancesList() {
  const { t } = useTranslation('customerBalances');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [includeZero, setIncludeZero] = useState(false); const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState('balance');
  useEffect(() => { const x = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(x); }, [search]);
  const list = useLoad(() => customerBalanceApi.list({ page, limit: 25, sortBy, sortDir: sortBy === 'name' || sortBy === 'code' ? 'asc' : 'desc',
    ...(q && { search: q }), ...(includeZero && { includeZero: 'true' }), ...(overdueOnly && { overdueOnly: 'true' }) }), [page, q, includeZero, overdueOnly, sortBy]);
  const rows = list.data?.data || []; const sum = list.data?.summary;
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const filtered = q || overdueOnly || includeZero;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      {sum && (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('stats.customersOwing')} value={sum.customers} />
          <Stat label={t('stats.totalBalance')} value={money(sum.balance)} />
          <Stat label={t('stats.overdue')} value={money(sum.overdue)} tone={Number(sum.overdue) > 0 ? 'text-red-600' : ''} />
          <Stat label={t('stats.overLimit')} value={sum.overLimitCount} tone={sum.overLimitCount > 0 ? 'text-red-600' : ''} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('sortAria')} value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
          {['balance', 'overdue', 'name', 'lastPaymentOn'].map((k) => <option key={k} value={k}>{t(`sort.${k}`)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={overdueOnly} onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }} />{t('overdueOnly')}</label>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={includeZero} onChange={(e) => { setIncludeZero(e.target.checked); setPage(1); }} />{t('includeZero')}</label>
      </div>
      {list.error && <div className={`px-4 ${NOTICE}`}><Banner>{list.error}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={8}>{filtered ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.customerId} className="bg-white">
                <td className={`${CELL} text-left`}>{r.name}<div className="text-xs">{r.code}{!r.isActive && ` · ${t('inactive')}`}</div></td>
                <td className={`${CELL} text-center`}>{r.openSales}</td>
                <td className={`${CELL} whitespace-nowrap text-center !font-semibold`}>{money(r.balance)}{r.overLimit && <div className="text-xs font-semibold text-red-600">{t('overLimitTag')}</div>}</td>
                <td className={`${CELL} whitespace-nowrap text-center ${Number(r.overdue) > 0 ? '!font-semibold !text-red-600' : ''}`}>{Number(r.overdue) > 0 ? money(r.overdue) : '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.creditLimit)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.availableCredit)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.lastPaymentOn)}</td>
                <td className={`${CELL} text-center`}>
                  <Link to={`/customer-balances/${r.customerId}`} title={t('view')} aria-label={t('viewName', { name: r.name })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><EyeIcon /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-6 py-3 text-sm text-black">
        <span>{t('records', { total })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{t('next')}</button>
        </div>
      </div>
    </div>
  );
}

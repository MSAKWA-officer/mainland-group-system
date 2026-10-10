import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { orderWorkflowApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon } from '../../components/Icons.jsx';
import Pill from '../../components/Pill.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { day, money } from '../salesOrders/SalesOrdersList.jsx';
import { NOTICE, STAGES, STATUS, StatusDot, hasAction, useWorkflowText } from './workflowUi.jsx';

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['orderNo', 'date', 'customer', 'salesperson', 'total', 'attempt', 'status', 'with', 'lastUpdate', ''];

export default function OrderWorkflowList() {
  const x = useWorkflowText();
  const { t } = x;
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  // Open on the tab where this user normally has work to do.
  const [stage, setStage] = useState(can('order_workflow.storekeeper_review') ? 'STOREKEEPER' : can('order_workflow.manager_review') ? 'MANAGER' : '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const list = useLoad(() => orderWorkflowApi.list({ page, limit: 25, ...(stage && { stage }), ...(status && { status }), ...(q && { search: q }) }), [page, stage, status, q]);
  const counts = useLoad(() => orderWorkflowApi.summary().catch(() => null), [list.data]);   // badges are a nicety: ignore failures
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const pick = (s) => { setStage(s); setStatus(''); setPage(1); };
  const statuses = Object.entries(STATUS).filter(([, v]) => !stage || v.stage === stage);
  const tabs = [['', t('tabAll')], ...STAGES.map((k) => [k, t(`stages.${k}`)])];
  const count = (k) => (k ? counts.data?.[k] : Object.values(counts.data || {}).reduce((s, n) => s + Number(n || 0), 0));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4 pb-3">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle', { total })}</p>
      </div>
      <div className="flex flex-wrap gap-1 px-4" role="tablist" aria-label={t('tabsAria')}>
        {tabs.map(([k, label]) => (
          <button key={k || 'all'} type="button" role="tab" aria-selected={stage === k} onClick={() => pick(k)}
            className={`rounded-md px-3 py-1.5 text-[14px] ${stage === k ? 'bg-ink font-semibold text-white' : 'border border-line bg-white hover:bg-mist'}`}>
            {label}{counts.data && count(k) !== undefined ? ` (${count(k) || 0})` : ''}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[16rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatusAria')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('allStatuses')}</option>{statuses.map(([k]) => <option key={k} value={k}>{x.status(k)}</option>)}
        </select>
      </div>
      {(list.error || location.state?.msg) && <div className={`px-4 ${NOTICE}`}><Banner>{list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k || 'x'} className={`${HEAD} ${al(i)}`}>{k && t(`columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{q || status || stage ? t('emptyFiltered') : t('emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.order?.orderNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.order?.orderDate)}</td>
                <td className={`${CELL} text-center`}>{r.order?.customer?.name}<div className="text-xs">{r.order?.customer?.code}</div></td>
                <td className={`${CELL} text-center`}>{r.order?.salesperson?.fullName || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.order?.total)}</td>
                <td className={`${CELL} text-center`}>{r.cycle}</td>
                <td className={`${CELL} text-center`}><StatusDot status={r.status} />{hasAction(r) && <div className="mt-1"><Pill tone="warn">{t('yourTurn')}</Pill></div>}</td>
                <td className={`${CELL} text-center`}>{x.waitingOn(r.status)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{fmt(r.updatedAt)}</td>
                <td className={`${CELL} text-center`}>
                  <Link to={`/order-workflow/${r.id}`} title={tc('view')} aria-label={t('viewAria', { orderNo: r.order?.orderNo })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><EyeIcon /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-[14px]">
        <span>{tc('records', { total })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auditApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import Pill from '../../components/Pill.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const FIELD = 'input !text-[14px] !text-[#212121]';
const EMPTY = { username: '', action: '', outcome: '', from: '', to: '' };
// Every action the API writes to the log. Unknown ones are still shown (as their code), they just are not in the drop-down.
const ACTIONS = ['ACCESS_DENIED', 'APPROVAL_APPROVED', 'APPROVAL_CANCELLED', 'APPROVAL_CREATED', 'APPROVAL_DELETED', 'APPROVAL_EXECUTED', 'APPROVAL_FAILED', 'APPROVAL_REJECTED', 'APPROVAL_SUBMITTED', 'APPROVAL_UPDATED',
  'BANK_ACCOUNT_CREATED', 'BANK_ACCOUNT_DELETED', 'BANK_ACCOUNT_UPDATED', 'BANK_CREATED', 'BANK_DELETED', 'BANK_TRANSACTION_POSTED', 'BANK_TRANSACTION_VOIDED', 'BANK_TRANSFER_MADE', 'BANK_UPDATED',
  'CASH_SALE_COMPLETED', 'CASH_SALE_VOIDED', 'CATEGORY_CREATED', 'CATEGORY_DELETED', 'CATEGORY_UPDATED', 'CREDIT_PAYMENT_RECEIVED', 'CREDIT_PAYMENT_VOIDED',
  'CREDIT_SALE_CANCELLED', 'CREDIT_SALE_COMPLETED', 'CREDIT_SALE_CREATED', 'CREDIT_SALE_DELETED', 'CREDIT_SALE_SUBMITTED', 'CREDIT_SALE_UPDATED', 'CREDIT_SALE_VOIDED',
  'CUSTOMER_CREATED', 'CUSTOMER_DELETED', 'CUSTOMER_PAYMENT_RECEIVED', 'CUSTOMER_PAYMENT_VOIDED', 'CUSTOMER_UPDATED', 'DISCOUNT_CREATED', 'DISCOUNT_DELETED', 'DISCOUNT_UPDATED',
  'DRIVER_CREATED', 'DRIVER_DELETED', 'DRIVER_UPDATED', 'EFD_DEVICE_CREATED', 'EFD_DEVICE_DELETED', 'EFD_DEVICE_UPDATED', 'EFD_RECEIPT_RECORDED', 'EFD_RECEIPT_VOIDED',
  'EFD_RECONCILIATION_CREATED', 'EFD_RECONCILIATION_RECONCILED', 'EFD_RECONCILIATION_REFRESHED', 'EFD_RECONCILIATION_VOIDED', 'EFD_REPORT_EXPORTED', 'EFD_Z_REPORT_CREATED', 'EFD_Z_REPORT_UPDATED', 'EFD_Z_REPORT_VOIDED',
  'EXPENSE_CREATED', 'EXPENSE_UPDATED', 'EXPENSE_VOIDED', 'FILE_DOWNLOADED', 'FILE_UPLOADED', 'FUEL_FUNDING_CREATED', 'FUEL_FUNDING_UPDATED', 'FUEL_FUNDING_VOIDED', 'FUEL_USAGE_CREATED', 'FUEL_USAGE_UPDATED', 'FUEL_USAGE_VOIDED',
  'ITEM_CREATED', 'ITEM_DELETED', 'ITEM_UPDATED', 'LOGIN_BLOCKED', 'LOGIN_FAILED', 'LOGIN_SUCCESS', 'LOGOUT', 'ORDER_WORKFLOW_ACKNOWLEDGED', 'ORDER_WORKFLOW_CANCELLED', 'ORDER_WORKFLOW_STOREKEEPER_VERIFIED',
  'PASSWORD_CHANGED', 'PASSWORD_RESET', 'PAYMENT_CREATED', 'PAYMENT_VOIDED', 'REFRESH_TOKEN_REUSE', 'REPORT_VIEWED', 'ROLE_PERMISSIONS_CHANGED', 'SALESPERSON_CREATED', 'SALESPERSON_DELETED', 'SALESPERSON_UPDATED',
  'SALES_ORDER_CANCELLED', 'SALES_ORDER_CONFIRMED', 'SALES_ORDER_CREATED', 'SALES_ORDER_DELETED', 'SALES_ORDER_SUBMITTED', 'SALES_ORDER_UPDATED', 'STAFF_ACTIVATED', 'STAFF_CREATED', 'STAFF_DEACTIVATED', 'STAFF_DELETED', 'STAFF_UPDATED',
  'STOCK_DOC_CANCELLED', 'STOCK_DOC_CREATED', 'STOCK_DOC_DELETED', 'STOCK_DOC_SUBMITTED', 'STOCK_DOC_UPDATED', 'STOCK_POSTED', 'USER_CREATED', 'USER_UPDATED', 'VEHICLE_CREATED', 'VEHICLE_DELETED', 'VEHICLE_UPDATED'];

// The whole Audit log screen in ONE panel: heading, filters, messages, table (with expandable details) and pager all sit inside the same div.
export default function AuditLogList() {
  const { t } = useTranslation('audit');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(EMPTY);          // what is typed in the filter boxes
  const [applied, setApplied] = useState({}); // what the list is actually filtered by
  const [open, setOpen] = useState(null);
  const list = useLoad(() => auditApi.list({ ...applied, page }), [page, applied]);
  const result = list.data; const rows = result?.data || [];
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  const apply = (e) => {
    e.preventDefault(); setPage(1); setOpen(null);
    setApplied(Object.fromEntries(Object.entries(q).filter(([, v]) => v).map(([k, v]) => [k, k === 'to' ? `${v}T23:59:59` : v])));
  };
  const reset = () => { setQ(EMPTY); setApplied({}); setPage(1); setOpen(null); };
  const heads = ['when', 'user', 'action', 'record', 'outcome', 'ip'].map((k) => t(`heads.${k}`));
  const action = (code) => t(`actions.${code}`, { defaultValue: code });
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <form onSubmit={apply} className="grid gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-7">
        <input className={FIELD} placeholder={t('filters.username')} aria-label={t('filters.username')} value={q.username} onChange={set('username')} />
        <select className={FIELD} aria-label={t('filters.action')} value={q.action} onChange={set('action')}>
          <option value="">{t('filters.anyAction')}</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{action(a)}</option>)}
        </select>
        <select className={FIELD} aria-label={t('filters.outcome')} value={q.outcome} onChange={set('outcome')}>
          <option value="">{t('filters.anyOutcome')}</option>
          {['SUCCESS', 'DENIED', 'FAILED'].map((o) => <option key={o} value={o}>{t(`outcome.${o}`)}</option>)}
        </select>
        <input className={FIELD} type="date" aria-label={t('filters.from')} value={q.from} max={q.to || undefined} onChange={set('from')} />
        <input className={FIELD} type="date" aria-label={t('filters.to')} value={q.to} min={q.from || undefined} onChange={set('to')} />
        <button className="btn-primary text-[14px] font-bold">{t('filters.filter')}</button>
        <button type="button" className="btn-ghost text-[14px]" onClick={reset}>{t('filters.reset')}</button>
      </form>
      <div className="px-4"><Banner>{list.error}</Banner></div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {result && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={6}>{t('empty')}</td></tr>}
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer bg-white hover:bg-[#f9fafb]" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className={`${CELL} whitespace-nowrap text-left`}>{fmt(r.occurredAt)}</td>
                  <td className={`${CELL} text-center`}>{r.username || '—'}</td>
                  <td className={`${CELL} text-center`}>{action(r.action)}<div className="text-xs">{r.action}</div></td>
                  <td className={`${CELL} text-center`}>{r.entityType ? t(`entities.${r.entityType}`, { defaultValue: r.entityType }) : '—'}<div className="text-xs">{r.entityId}</div></td>
                  <td className={`${CELL} text-center`}><Pill tone={r.outcome === 'SUCCESS' ? 'ok' : r.outcome === 'DENIED' ? 'bad' : 'warn'}>{t(`outcome.${r.outcome}`, { defaultValue: r.outcome })}</Pill></td>
                  <td className={`${CELL} text-center`}>{r.ip || '—'}</td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={6} className="border border-[#e5e7eb] bg-[#f9fafb] p-3 text-[14px]">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div><div className="mb-1 font-semibold">{t('before')}</div><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(r.oldValues, null, 2) || '—'}</pre></div>
                      <div><div className="mb-1 font-semibold">{t('after')}</div><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(r.newValues, null, 2) || '—'}</pre></div>
                    </div>
                    {r.reason && <p className="mt-2"><b>{t('reason')}:</b> {r.reason}</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {result && <Pager page={page} total={result.total} limit={result.limit} set={setPage} />}
    </div>
  );
}

import { Fragment, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { approvalApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { currentLocale } from '../../utils/locale';

// Still exported because ApprovalsView uses it for its status pill.
export const TONE = { DRAFT: 'off', SUBMITTED: 'warn', APPROVED: 'ok', EXECUTED: 'ok', REJECTED: 'bad', CANCELLED: 'off' };

// Maandishi yote ya ukurasa huu yanatoka locales/<lugha>/approvals.json.
// Aina za maombi (type) na hali (status) hutafsiriwa kwa code; code isiyojulikana inaonyeshwa kama ilivyo (au label ya backend).
export const useApprovalText = () => {
  const { t } = useTranslation('approvals');
  return {
    t,
    status: (s) => t(`status.${s}`, { defaultValue: s }),
    type: (code, label) => t(`types.${code}`, { defaultValue: label || code }),
    entity: (e) => t(`entities.${e}`, { defaultValue: e }),
  };
};

// Text-link actions separated by "|". Used by this list and by ApprovalsView.
// Delete is shown to the Owner only (the API enforces the same rule).
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('approvals');
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = r.requestedBy === user.id;
  const run = async (fn) => { onError(''); try { await fn(); onChanged?.(); } catch (x) { onError(errMsg(x)); } };
  const act = (action, body) => run(() => approvalApi.act(r.id, action, body));
  const remove = async () => {
    if (!window.confirm(t('confirmDelete'))) return;
    onError('');
    try { await approvalApi.remove(r.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  const items = [
    showView && ['view', () => navigate(`/approvals/${r.id}`)],
    mine && r.status === 'DRAFT' && ['edit', () => navigate(`/approvals/${r.id}/edit`)],
    mine && r.status === 'DRAFT' && ['submit', () => act('submit')],
    mine && ['DRAFT', 'SUBMITTED'].includes(r.status) && ['cancel', () => act('cancel')],
    !mine && r.status === 'SUBMITTED' && can('approvals.approve') && ['approve', () => act('approve', {})],
    !mine && r.status === 'SUBMITTED' && can('approvals.approve') && ['reject', () => { const note = window.prompt(t('rejectPrompt')); if (note) act('reject', { note }); }, true],
    user.role === 'OWNER' && ['delete', remove, true],
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {items.map(([key, fn, danger], i) => (
        <span key={key} className="flex items-center gap-2">
          {i > 0 && <span className="text-slate-300">|</span>}
          <button type="button" onClick={fn} className={`hover:underline ${danger ? 'text-red-600' : 'text-blue-600'}`}>{t(`actions.${key}`)}</button>
        </span>
      ))}
    </div>
  );
}

/* ---------- table style (Helvetica/Arial 14px, light-grey grid, bold headers) ---------- */
const FONT = { fontFamily: 'Arial, Helvetica, sans-serif' };
const GRID = 'border-[#e5e7eb]';
const head = `border ${GRID} h-[39px] px-3 py-2 text-[14px] font-semibold uppercase leading-5 text-[#212121]`;
const cell = `border ${GRID} h-[39px] px-3 py-2 align-middle text-[14px] leading-5 text-[#212121]`;

// The table shows this many data columns. Any further columns move into the "More" column,
// where a button opens them under the row. To show more or fewer columns, change this number.
const MAX_VISIBLE = 6;

// Compact date for the narrow Created column (04/10/26); the full date and time show on hover.
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(currentLocale(), { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');

// Every column the list can show, in priority order. `label` ni key ya cols.* kwenye approvals.json.
// `link` makes the cell open the request (blue, like the first column in the reference).
// cell(r, x): x = { status, type, entity } ni vitafsiri vya hali, aina na rekodi inayohusiana.
const COLUMNS = [
  { key: 'created', label: 'created', link: true, narrow: true, cell: (r) => shortDate(r.createdAt) },
  { key: 'type', label: 'type', cell: (r, x) => x.type(r.type) },
  { key: 'by', label: 'requestedBy', cell: (r) => r.requester?.fullName || '—' },
  { key: 'submitted', label: 'submitted', cell: (r) => fmt(r.submittedAt) },
  { key: 'status', label: 'status', align: 'center', cell: (r, x) => x.status(r.status) },
  { key: 'decision', label: 'decision', cell: (r) => (r.decider ? `${r.decider.fullName}, ${fmt(r.decidedAt)}` : '—') },
  // ---- beyond six: shown through the More button ----
  { key: 'note', label: 'requestNote', cell: (r) => r.payload?.note || '—' },
  { key: 'decisionNote', label: 'decisionNote', cell: (r) => r.decisionNote || '—' },
  { key: 'executed', label: 'executed', cell: (r) => fmt(r.executedAt) },
  { key: 'entity', label: 'relatedRecord', cell: (r, x) => (r.entityType ? `${x.entity(r.entityType)}${r.entityId ? ` ${r.entityId}` : ''}` : '—') },
];

export default function ApprovalsList() {
  const x = useApprovalText();
  const { t } = x;
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState({}); // request id -> true while its extra details are open
  const list = useLoad(() => approvalApi.list({ page }), [page]);
  const rows = list.data?.data || [];

  const visible = COLUMNS.slice(0, MAX_VISIBLE);
  const extra = COLUMNS.slice(MAX_VISIBLE);
  const hasMore = extra.length > 0;
  const span = visible.length + (hasMore ? 1 : 0) + 1; // data columns + More + Actions

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const total = list.data?.total ?? 0; const limit = list.data?.limit ?? 1;

  return (
    <div className="panel overflow-hidden text-[14px] text-[#212121] shadow-sm" style={FONT}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm">{t('registered', { total })}</p>
        </div>
        {can('approvals.create') && <Link to="/approvals/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('newRequest')}</Link>}
      </div>

      {(err || list.error || location.state?.msg) && (
        <div className="px-4"><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}

      <div className="overflow-x-auto px-4">
        <table className={`w-full border-collapse border ${GRID} bg-white`}>
          <thead>
            <tr>
              {visible.map((c, idx) => <th key={c.key} className={`${head} ${idx === 0 ? 'text-left' : 'text-center'} ${c.narrow ? 'w-px whitespace-nowrap !px-2' : ''}`}>{t(`cols.${c.label}`)}</th>)}
              {hasMore && <th className={`${head} text-center`}>{t('more')}</th>}
              <th className={`${head} text-center`}>{t('actionsCol')}</th>
            </tr>
          </thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={cell} colSpan={span}>{t('empty')}</td></tr>}
            {rows.map((r) => {
              const open = !!expanded[r.id];
              return (
                <Fragment key={r.id}>
                  <tr>
                    {visible.map((c, idx) => (
                      <td key={c.key} className={`${cell} ${idx === 0 ? 'text-left' : 'text-center'} ${c.narrow ? 'w-px whitespace-nowrap !px-2' : ''}`}>
                        {c.link ? <Link to={`/approvals/${r.id}`} title={c.narrow ? fmt(r.createdAt) : undefined} className="whitespace-nowrap text-[#337ab7] hover:underline">{c.cell(r, x)}</Link> : c.cell(r, x)}
                      </td>
                    ))}
                    {hasMore && (
                      <td className={`${cell} text-center`}>
                        <button type="button" onClick={() => toggle(r.id)} aria-expanded={open} aria-controls={`approval-more-${r.id}`}
                          className="rounded-md border border-blue-600 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                          {open ? t('less') : t('more')}
                        </button>
                      </td>
                    )}
                    <td className={`${cell} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={list.reload} onError={setErr} /></div></td>
                  </tr>
                  {hasMore && open && (
                    <tr id={`approval-more-${r.id}`}>
                      <td colSpan={span} className={`border ${GRID} bg-[#f9f9f9] px-3 py-3 text-[14px] text-[#212121]`}>
                        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                          {extra.map((c) => (
                            <div key={c.key}>
                              <dt className="font-bold">{t(`cols.${c.label}`)}</dt>
                              <dd className="mt-0.5 break-words">{c.cell(r, x)}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {list.data && (
        <div className="flex items-center justify-between px-4 py-3 text-[14px] text-[#212121]">
          <span>{t('records', { total })}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('previous')}</button>
            <button type="button" className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{t('next')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

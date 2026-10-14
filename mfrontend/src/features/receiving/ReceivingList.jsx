import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { receivingApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, PencilIcon, TrashIcon, BanIcon, CheckIcon, XIcon, SendIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { IconBtn, Tag, qty } from '../stock/StockList.jsx';
import { useDocText } from '../../utils/docText';

// Full set of workflow icons for one receiving document. Used by ReceivingView.
// Rules mirror the API: only the creator edits / submits / cancels, approvers never act on their own document,
// and only draft, cancelled or rejected documents can be deleted (by the creator or the Owner).
export function RowActions({ d, showView, onChanged, onError, afterDelete }) {
  const { t } = useDocText();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = d.createdBy === user.id;
  const run = async (fn) => { onError(''); try { await fn(); onChanged?.(); } catch (x) { onError(errMsg(x)); } };
  const act = (action, body) => run(() => receivingApi.act(d.id, action, body));
  const remove = async () => {
    if (!window.confirm(t('confirmDelete', { docNo: d.docNo }))) return;
    onError('');
    try { await receivingApi.remove(d.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  const canDelete = can('receiving.create') && (mine || user.role === 'OWNER') && ['DRAFT', 'CANCELLED', 'REJECTED'].includes(d.status);
  return (
    <div className="flex items-center gap-1">
      {showView && <IconBtn label={t('actions.view')} onClick={() => navigate(`/receiving/${d.id}`)}><EyeIcon /></IconBtn>}
      {mine && d.status === 'DRAFT' && <IconBtn label={t('actions.edit')} onClick={() => navigate(`/receiving/${d.id}/edit`)}><PencilIcon /></IconBtn>}
      {mine && d.status === 'DRAFT' && <IconBtn label={t('actions.submit')} onClick={() => act('submit')}><SendIcon /></IconBtn>}
      {mine && ['DRAFT', 'SUBMITTED'].includes(d.status) && <IconBtn label={t('actions.cancel')} onClick={() => act('cancel')}><BanIcon /></IconBtn>}
      {!mine && d.status === 'SUBMITTED' && can('receiving.approve') && <IconBtn label={t('actions.approve')} onClick={() => act('approve', {})}><CheckIcon /></IconBtn>}
      {!mine && d.status === 'SUBMITTED' && can('receiving.approve') && (
        <IconBtn label={t('actions.reject')} danger onClick={() => { const note = window.prompt(t('rejectPrompt')); if (note) act('reject', { note }); }}><XIcon /></IconBtn>
      )}
      {canDelete && <IconBtn label={t('actions.delete')} danger onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Icon button that can be greyed out. A disabled icon keeps its place in the row and explains why in its tooltip.
function ActionBtn({ label, onClick, disabled, why, danger, children }) {
  const tone = disabled ? 'cursor-not-allowed text-slate-300' : `${danger ? 'text-red-600' : 'text-blue-600'} hover:bg-slate-100`;
  return (
    <button type="button" title={disabled ? why : label} aria-label={label} disabled={disabled} onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${tone}`}>
      {children}
    </button>
  );
}

// The three row icons of the list: View, Edit, Delete. Edit / Delete follow the same API rules as RowActions.
// A saved receiving is posted to stock straight away, so it is locked: only a legacy draft can still be edited or deleted.
function ListActions({ d, onChanged, onError }) {
  const { t } = useDocText();
  const { t: tr } = useTranslation('receiving');
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = d.createdBy === user.id;
  const canEdit = mine && d.status === 'DRAFT';
  const canDelete = can('receiving.create') && (mine || user.role === 'OWNER') && ['DRAFT', 'CANCELLED', 'REJECTED'].includes(d.status);
  const remove = async () => {
    if (!window.confirm(t('confirmDelete', { docNo: d.docNo }))) return;
    onError('');
    try { await receivingApi.remove(d.id); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center justify-center gap-1">
      <ActionBtn label={t('actions.view')} onClick={() => navigate(`/receiving/${d.id}`)}><EyeIcon /></ActionBtn>
      <ActionBtn label={t('actions.edit')} disabled={!canEdit} why={tr('editLocked')} onClick={() => navigate(`/receiving/${d.id}/edit`)}><PencilIcon /></ActionBtn>
      <ActionBtn label={t('actions.delete')} danger disabled={!canDelete} why={tr('deleteLocked')} onClick={remove}><TrashIcon /></ActionBtn>
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function ReceivingList() {
  const { t } = useTranslation('receiving');
  const docs = useDocText();
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');     // what the user types
  const [search, setSearch] = useState('');   // debounced value sent to the API (date, batch no or item)
  const [err, setErr] = useState('');
  useEffect(() => {
    const h = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 350);
    return () => clearTimeout(h);
  }, [input]);
  const list = useLoad(() => receivingApi.list({ page, search: search || undefined }), [page, search]);
  const rows = list.data?.data || [];
  const heads = ['date', 'items', 'unitQty', 'batchNo', 'createdBy', 'status', 'actions'];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { total: list.data ? list.data.total : 0 })}</p>
        </div>
        {can('receiving.create') && <Link to="/receiving/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('new')}</Link>}
      </div>
      <div className="px-4">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner>
        <div className="mb-4">
          <input type="search" className="input max-w-sm !text-[14px] !text-[#212121]" placeholder={t('search')} aria-label={t('search')}
            value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`cols.${h}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{t('empty')}</td></tr>}
            {/* One table row per item line. Date, Created by, Status and Action span all the lines of their receiving. */}
            {rows.flatMap((d) => {
              const lines = d.lines?.length ? d.lines : [null];
              return lines.map((l, n) => (
                <tr key={`${d.id}-${l?.id ?? n}`} className="bg-white">
                  {n === 0 && <td rowSpan={lines.length} className={`${CELL} whitespace-nowrap text-left`}>{d.docDate}</td>}
                  <td className={`${CELL} text-center`}>{l?.item?.name || '—'}</td>
                  <td className={`${CELL} text-center`}>{l ? `${qty(l.quantity)} ${l.item?.unit || ''}`.trim() : '—'}</td>
                  <td className={`${CELL} text-center`}>{l?.batch?.batchNo || l?.batchNo || '—'}</td>
                  {n === 0 && (
                    <>
                      <td rowSpan={lines.length} className={`${CELL} text-center`}>{d.creator?.fullName || '—'}</td>
                      <td rowSpan={lines.length} className={`${CELL} text-center`}><Tag>{docs.status(d.status)}</Tag></td>
                      <td rowSpan={lines.length} className={`${CELL} text-center`}><ListActions d={d} onChanged={list.reload} onError={setErr} /></td>
                    </>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

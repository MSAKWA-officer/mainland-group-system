import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { rejectOutApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, PencilIcon, TrashIcon, BanIcon, CheckIcon, XIcon, SendIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { IconBtn, Tag } from '../stock/StockList.jsx';
import { useDocText } from '../../utils/docText';
import { canCorrectDoc, useReversePosted } from '../stock/postedDocs.jsx';

// Icon actions for one return document. Used by this list and by RejectOutView.
// Rules mirror the API: only the creator edits / submits / cancels, approvers never act on their own document,
// and only draft, cancelled or rejected documents can be deleted (by the creator or the Owner).
export function RowActions({ d, showView, onChanged, onError, afterDelete }) {
  const { t } = useDocText();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const mine = d.createdBy === user.id;
  const posted = canCorrectDoc(d, user, can, 'reject_out');                       // POSTED: Delete = reverse the stock, Edit = correct
  const reversePosted = useReversePosted({ api: rejectOutApi, onChanged: afterDelete || onChanged, onError, askReason: false });
  const run = async (fn) => { onError(''); try { await fn(); onChanged?.(); } catch (x) { onError(errMsg(x)); } };
  const act = (action, body) => run(() => rejectOutApi.act(d.id, action, body));
  const remove = async () => {
    if (posted) return reversePosted(d);
    if (!window.confirm(t('confirmDelete', { docNo: d.docNo }))) return;
    onError('');
    try { await rejectOutApi.remove(d.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  const canDelete = can('reject_out.create') && (mine || user.role === 'OWNER') && ['DRAFT', 'CANCELLED', 'REJECTED'].includes(d.status) || posted;
  return (
    <div className="flex items-center gap-1">
      {showView && <IconBtn label={t('actions.view')} onClick={() => navigate(`/reject-out/${d.id}`)}><EyeIcon /></IconBtn>}
      {((mine && d.status === 'DRAFT') || posted) && <IconBtn label={t('actions.edit')} onClick={() => navigate(`/reject-out/${d.id}/edit`)}><PencilIcon /></IconBtn>}
      {mine && d.status === 'DRAFT' && <IconBtn label={t('actions.submit')} onClick={() => act('submit')}><SendIcon /></IconBtn>}
      {mine && ['DRAFT', 'SUBMITTED'].includes(d.status) && <IconBtn label={t('actions.cancel')} onClick={() => act('cancel')}><BanIcon /></IconBtn>}
      {!mine && d.status === 'SUBMITTED' && can('reject_out.approve') && <IconBtn label={t('actions.approve')} onClick={() => act('approve', {})}><CheckIcon /></IconBtn>}
      {!mine && d.status === 'SUBMITTED' && can('reject_out.approve') && (
        <IconBtn label={t('actions.reject')} danger onClick={() => { const note = window.prompt(t('rejectPrompt')); if (note) act('reject', { note }); }}><XIcon /></IconBtn>
      )}
      {canDelete && <IconBtn label={t('actions.delete')} danger onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function RejectOutList() {
  const { t } = useTranslation('rejectOut');
  const { status: statusText } = useDocText();
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  const list = useLoad(() => rejectOutApi.list({ page, search: search || undefined, status: status || undefined, from: from || undefined, to: to || undefined }), [page, search, status, from, to]);
  const rows = list.data?.data || [];
  const heads = ['docNo', 'date', 'warehouse', 'party', 'reference', 'reason', 'lines', 'createdBy', 'status', 'actions'].map((k) => t(`heads.${k}`));
  const reset = (set) => (e) => { setPage(1); set(e.target.value); };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { count: list.data ? list.data.total : 0 })}</p>
        </div>
        {can('reject_out.create') && <Link to="/reject-out/new" className="btn-primary px-4 py-2 text-[14px] font-bold">{t('newReturn')}</Link>}
      </div>
      <div className="px-4">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} value={search} onChange={reset(setSearch)} />
          <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" value={status} onChange={reset(setStatus)}>
            <option value="">{t('allStatuses')}</option>
            {['DRAFT', 'SUBMITTED', 'POSTED', 'REJECTED', 'CANCELLED'].map((k) => <option key={k} value={k}>{statusText(k)}</option>)}
          </select>
          <label className="text-[14px]">{t('from')} <input className="input ml-1 inline-block w-auto !text-[14px] !text-[#212121]" type="date" value={from} onChange={reset(setFrom)} /></label>
          <label className="text-[14px]">{t('to')} <input className="input ml-1 inline-block w-auto !text-[14px] !text-[#212121]" type="date" value={to} onChange={reset(setTo)} /></label>
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{t('list.empty')}</td></tr>}
            {rows.map((d) => (
              <tr key={d.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{d.docNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{d.docDate}</td>
                <td className={`${CELL} text-center`}>{d.warehouse?.name || '—'}</td>
                <td className={`${CELL} text-center`}>{d.partyName || '—'}</td>
                <td className={`${CELL} text-center`}>{d.reference || '—'}</td>
                <td className={`${CELL} text-center`}>{d.reason || '—'}</td>
                <td className={`${CELL} text-center`}>{d.lineCount ?? 0}</td>
                <td className={`${CELL} text-center`}>{d.creator?.fullName}</td>
                <td className={`${CELL} text-center`}><Tag>{statusText(d.status)}</Tag></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions d={d} showView onChanged={list.reload} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

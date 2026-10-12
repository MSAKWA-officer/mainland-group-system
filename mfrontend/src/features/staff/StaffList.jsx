import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, staffApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon, UserCheckIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';

export const IconBtn = ({ label, onClick, tone, children }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${tone}`}>{children}</button>
);
const TONES = {
  view: 'border-blue-200 text-blue-600 hover:bg-blue-50', edit: 'border-amber-200 text-amber-600 hover:bg-amber-50', off: 'border-slate-300 text-slate-600 hover:bg-slate-100',
  on: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50', del: 'border-red-200 text-red-600 hover:bg-red-50', acct: 'border-blue-200 text-blue-600 hover:bg-blue-50',
};
export const Tag = ({ children }) => <span className="inline-block rounded border border-black/30 px-2 py-0.5 text-xs">{children}</span>;

// Icon actions for one staff member. Used by this list and by StaffView. The server enforces every rule; the buttons only hide what you cannot do.
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('staff');
  const { can } = useAuth();
  const navigate = useNavigate();
  const toggle = async () => {
    let body = { isActive: true };
    if (r.isActive) { const reason = window.prompt(t('prompts.deactivate', { name: r.fullName })); if (!reason || !reason.trim()) return; body = { isActive: false, reason: reason.trim() }; }
    onError('');
    try { await staffApi.setStatus(r.id, body); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('prompts.delete', { name: r.fullName }))) return;
    onError('');
    try { await staffApi.remove(r.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center justify-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/staff/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('users.create') && r.isActive && !r.hasAccount && <IconBtn label={t('actions.createAccount')} tone={TONES.acct} onClick={() => navigate(`/users/new?staffId=${r.id}`)}><UserCheckIcon /></IconBtn>}
      {can('staff.update') && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/staff/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('staff.deactivate') && !r.hasAccount && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('staff.delete') && !r.hasAccount && <IconBtn label={t('actions.delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

// Staff directory. People are registered here first (no login). "Create account" jumps to User management with the person pre-selected.
export default function StaffList() {
  const { t } = useTranslation('staff');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');   // q = debounced search term
  const [account, setAccount] = useState(''); const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const h = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [search]);
  const list = useLoad(() => staffApi.list({ page, limit: 25, ...(q && { search: q }), ...(account && { account }), ...(status && { isActive: status }) }), [page, q, account, status]);
  const rows = list.data?.data || [];
  const heads = ['code', 'name', 'position', 'phone', 'account', 'status', 'actions'].map((k) => t(`heads.${k}`));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('registered', { count: list.data ? list.data.total : 0 })}</p>
        </div>
        {can('staff.create') && <Link to="/staff/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('add')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" type="search" aria-label={t('search')} placeholder={t('searchPlaceholder')} maxLength={80} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('filterAccount')} value={account} onChange={(e) => { setAccount(e.target.value); setPage(1); }}>
          <option value="">{t('allPeople')}</option><option value="without">{t('noAccountYet')}</option><option value="with">{t('hasAccount')}</option>
        </select>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('filterStatus')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('allStatuses')}</option><option value="true">{t('active')}</option><option value="false">{t('inactive')}</option>
        </select>
      </div>
      <div className="px-4"><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{q || account || status ? t('empty.filtered') : t('empty.none')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}><Link to={`/staff/${r.id}`} className="underline">{r.code}</Link></td>
                <td className={`${CELL} text-center`}>{r.fullName}{r.email && <div className="text-xs font-normal">{r.email}</div>}</td>
                <td className={`${CELL} text-center`}>{r.position || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.phone || '—'}</td>
                <td className={`${CELL} text-center`}>{r.user ? <><div>{r.user.username}</div><div className="text-xs">{r.user.role?.name}</div></> : <Tag>{t('noAccount')}</Tag>}</td>
                <td className={`${CELL} text-center`}><Tag>{r.isActive ? t('active') : t('inactive')}</Tag></td>
                <td className={`${CELL} text-center`}><RowActions r={r} showView onChanged={list.reload} onError={setErr} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

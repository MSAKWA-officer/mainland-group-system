import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { userApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, PencilIcon, TrashIcon, KeyIcon, UserXIcon, UserCheckIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';

// Icon-only action button. title + aria-label keep the meaning available on hover and for screen readers.
function IconBtn({ label, onClick, danger, children }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${danger ? 'text-red-600' : 'text-blue-600'}`}>
      {children}
    </button>
  );
}

// Icon actions. Used by this list and by UserView. Edit/Deactivate/Reset/Delete are shown by permission;
// you never get Deactivate or Delete on your own account (the API enforces the same rules).
export function RowActions({ u, showView, onChanged, onError, onMsg, afterDelete }) {
  const { user: me, can } = useAuth();
  const navigate = useNavigate();
  const self = me.id === u.id;
  const active = u.status === 'ACTIVE';
  const run = async (fn) => { onError(''); onMsg?.(''); try { await fn(); onChanged?.(); } catch (x) { onError(errMsg(x)); } };

  const toggle = () => run(async () => {
    if (active) {
      const reason = window.prompt(`Why is ${u.username} being deactivated?`); if (!reason) return;
      await userApi.setStatus(u.id, { status: 'INACTIVE', reason });
    } else await userApi.setStatus(u.id, { status: 'ACTIVE' });
  });
  const reset = () => run(async () => {
    const p = window.prompt(`New temporary password for ${u.username} (10+ chars, upper, lower, digit, symbol):`); if (!p) return;
    await userApi.resetPassword(u.id, p); onMsg?.('Password reset. The user must choose a new one at next sign-in.');
  });
  const remove = async () => {
    if (!window.confirm(`Delete ${u.fullName} (${u.username})? They will no longer be able to sign in. The deletion is kept in the audit log.`)) return;
    onError('');
    try { await userApi.remove(u.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };

  return (
    <div className="flex items-center gap-1">
      {showView && <IconBtn label="View" onClick={() => navigate(`/users/${u.id}`)}><EyeIcon /></IconBtn>}
      {can('users.update') && <IconBtn label="Edit" onClick={() => navigate(`/users/${u.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('users.deactivate') && !self && <IconBtn label={active ? 'Deactivate' : 'Activate'} onClick={toggle}>{active ? <UserXIcon /> : <UserCheckIcon />}</IconBtn>}
      {can('users.reset_password') && <IconBtn label="Reset password" onClick={reset}><KeyIcon /></IconBtn>}
      {can('users.delete') && !self && <IconBtn label="Delete" danger onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');

export default function UserList() {
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(location.state?.msg || '');
  const list = useLoad(() => userApi.list({ page, search: search || undefined }), [page, search]);
  const rows = list.data?.data || [];
  const heads = ['Name', 'Username', 'Role', 'Status', 'Last sign-in', 'Actions'];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">Users</h1>
          <p className="mt-0.5 text-[14px]">{list.data ? list.data.total : 0} registered</p>
        </div>
        {can('users.create') && <Link to="/users/new" className="btn-primary px-4 py-2 text-[14px] font-bold">+ Add User</Link>}
      </div>
      <div className="px-4">
        <Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner>
        <input className="input mb-4 max-w-xs !text-[14px] !text-[#212121]" placeholder="Search name, username or email" value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
      </div>
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>No users found.</td></tr>}
            {rows.map((u) => (
              <tr key={u.id} className="bg-white">
                <td className={`${CELL} text-left`}><div>{u.fullName}</div><div className="text-xs">{u.email || ''}</div></td>
                <td className={`${CELL} text-center`}>{u.username}</td>
                <td className={`${CELL} text-center`}>{u.role?.name}</td>
                <td className={`${CELL} text-center`}><span className="inline-block rounded border border-black/30 px-2 py-0.5 text-xs">{u.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{fmt(u.lastLoginAt)}</td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions u={u} showView onChanged={list.reload} onError={setErr} onMsg={setMsg} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} set={setPage} />}
    </div>
  );
}

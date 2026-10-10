import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { userApi, roleApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import useLoad from '../../utils/useLoad';

// Username cannot be changed. You cannot change your own role (the API enforces this too).
export default function UserUpdate() {
  const { id } = useParams();
  const { user: me, can } = useAuth();
  const navigate = useNavigate();
  const item = useLoad(() => userApi.get(id), [id]);
  const roles = useLoad(() => (can('roles.read') ? roleApi.listRoles() : Promise.resolve([])), []);
  const [f, setF] = useState({ fullName: '', email: '', phone: '', roleId: '' });
  const [fe, setFe] = useState({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const u = item.data;
  useEffect(() => { if (u) setF({ fullName: u.fullName, email: u.email || '', phone: u.phone || '', roleId: u.role?.id || '' }); }, [u]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      const body = { fullName: f.fullName, email: f.email || null, phone: f.phone || null };
      if (f.roleId !== u.role?.id) body.roleId = f.roleId;
      await userApi.update(id, body);
      navigate(`/users/${id}`, { state: { msg: 'User updated.' } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Edit User</h1>
          <p className="mt-1 text-sm">{u ? `${u.fullName} (${u.username})` : 'Loading…'}</p>
        </div>
        <Link to={`/users/${id}`} className="text-sm hover:underline">← Back</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6">
        <Banner>{err || item.error || roles.error}</Banner>
        {u && (
          <div className="max-w-xl space-y-4">
            <Field label="Username"><input className="input !text-black" value={u.username} disabled /></Field>
            <Field label="Full name" error={fe.fullName}><input className="input !text-black" required value={f.fullName} onChange={set('fullName')} /></Field>
            <Field label="Email (optional)" error={fe.email}><input className="input !text-black" type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone (optional)" error={fe.phone}><input className="input !text-black" value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Role" error={fe.roleId}>
              <select className="input !text-black" required value={f.roleId} onChange={set('roleId')} disabled={u.id === me.id}>
                <option value="">Choose a role</option>
                {(roles.data || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {u.id === me.id && <p className="mt-1 text-xs">You cannot change your own role.</p>}
            </Field>
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        )}
      </form>
    </div>
  );
}

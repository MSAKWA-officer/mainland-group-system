import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { userApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { RowActions } from './UserList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd>{children || '—'}</dd>
  </div>
);

export default function UserView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(location.state?.msg || '');
  const q = useLoad(() => userApi.get(id), [id]);
  const u = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{u ? u.fullName : 'User'}</h1>
          <p className="mt-1 text-sm">{u ? u.username : 'Loading…'}</p>
        </div>
        <Link to="/users" className="text-sm hover:underline">← Back to list</Link>
      </div>
      {(err || q.error || msg) && <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {u && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label="Full name">{u.fullName}</Row>
            <Row label="Username">{u.username}</Row>
            <Row label="Email">{u.email}</Row>
            <Row label="Phone">{u.phone}</Row>
            <Row label="Role">{u.role?.name}</Row>
            <Row label="Status">{u.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Row>
            <Row label="Last sign-in">{u.lastLoginAt && fmt(u.lastLoginAt)}</Row>
            <Row label="Created">{fmt(u.createdAt)}</Row>
            <Row label="Password change required">{u.mustChangePassword ? 'Yes' : 'No'}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions u={u} onChanged={q.reload} onError={setErr} onMsg={setMsg}
              afterDelete={() => navigate('/users', { state: { msg: `User ${u.username} deleted.` } })} />
          </div>
        </div>
      )}
    </div>
  );
}

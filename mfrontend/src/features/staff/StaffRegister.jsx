import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { staffApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ROLES } from './StaffList.jsx';

const EMPTY = { role: '', username: '', fullName: '', email: '', phone: '', password: '', region: '', commissionRate: '0', monthlyTarget: '0' };
const HINT = {
  MANAGER: 'Reviews and approves. Sees all customers, orders and sales.',
  SALESPERSON: 'Gets a salesperson profile and sees only their own customers and orders.',
  STOREKEEPER: 'Warehouse and stock control.',
};

// A random temporary password that satisfies the password rules (10+ chars, upper, lower, digit, symbol).
const makePassword = () => {
  const pick = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const all = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?';
  const chars = [pick('abcdefghijkmnpqrstuvwxyz'), pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('23456789'), pick('!@#$%&*?')];
  while (chars.length < 14) chars.push(pick(all));
  return chars.sort(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 - 0.5).join('');
};

export default function StaffRegister() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [fe, setFe] = useState({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isSales = f.role === 'SALESPERSON';
  const canPay = can('salespersons.view_commission');
  const roles = ROLES.filter(([code]) => code !== 'SALESPERSON' || can('salespersons.create'));

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      const body = { role: f.role, username: f.username, fullName: f.fullName, email: f.email.trim() || null, phone: f.phone.trim() || null, password: f.password };
      if (isSales) { body.region = f.region.trim() || null; if (canPay) { body.commissionRate = Number(f.commissionRate || 0); body.monthlyTarget = Number(f.monthlyTarget || 0); } }
      const r = await staffApi.register(body);
      navigate('/staff', { state: { msg: `${r.user.role.name} account “${r.user.username}” created${r.salesperson ? ` (${r.salesperson.code})` : ''}. They must change the password at first sign-in.` } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };

  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Register staff</h1>
          <p className="mt-1 text-sm">Choose the role, then create the sign-in account. The password is temporary.</p>
        </div>
        <Link to="/staff" className="text-sm hover:underline">← Back to list</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <Banner>{err}</Banner>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Role" error={fe.role}>
              <select className="input !text-black" required value={f.role} onChange={set('role')}>
                <option value="">Choose a role</option>
                {roles.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </Field>
            {f.role && <p className="mt-1 text-xs">{HINT[f.role]}</p>}
          </div>
          <Field label="Full name" error={fe.fullName}><input className="input !text-black" required minLength={2} maxLength={100} value={f.fullName} onChange={set('fullName')} /></Field>
          <Field label="Username" error={fe.username}><input className="input !text-black" required autoComplete="off" maxLength={30} placeholder="e.g. amina.k" value={f.username} onChange={set('username')} /></Field>
          <Field label="Phone (optional)" error={fe.phone}><input className="input !text-black" type="tel" maxLength={30} placeholder="+255 ..." value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email (optional)" error={fe.email}><input className="input !text-black" type="email" maxLength={150} value={f.email} onChange={set('email')} /></Field>
          <div className="sm:col-span-2">
            <Field label="Temporary password" error={fe.password}>
              <div className="flex gap-2">
                <input className="input !text-black" type={show ? 'text' : 'password'} required autoComplete="new-password" value={f.password} onChange={set('password')} />
                <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
                <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => { setF({ ...f, password: makePassword() }); setShow(true); }}>Generate</button>
              </div>
            </Field>
            <p className="mt-1 text-xs">At least 10 characters with upper and lower case, a digit and a symbol. Share it with the person safely; they will be asked to change it.</p>
          </div>
          {isSales && (
            <>
              <Field label="Region (optional)" error={fe.region}><input className="input !text-black" maxLength={80} value={f.region} onChange={set('region')} /></Field>
              <div className="hidden sm:block" />
              {canPay && (
                <>
                  <Field label="Commission rate (%)" error={fe.commissionRate}><input className="input !text-black" type="number" min="0" max="100" step="0.01" value={f.commissionRate} onChange={set('commissionRate')} /></Field>
                  <Field label="Monthly target" error={fe.monthlyTarget}><input className="input !text-black" type="number" min="0" step="0.01" value={f.monthlyTarget} onChange={set('monthlyTarget')} /></Field>
                </>
              )}
            </>
          )}
        </div>
        <button className="btn-primary" disabled={busy || !f.role}>{busy ? 'Saving…' : f.role ? `Register ${ROLES.find(([c]) => c === f.role)[1]}` : 'Register'}</button>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { userApi, roleApi, staffApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import useLoad from '../../utils/useLoad';

const EMPTY = { username: '', roleId: '', password: '', region: '', commissionRate: '0', monthlyTarget: '0' };

// A random temporary password that satisfies the password rules (10+ chars, upper, lower, digit, symbol).
const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const pick = (s) => s[rnd(s.length)];
const makePassword = () => {
  const all = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?';
  const c = [pick('abcdefghijkmnpqrstuvwxyz'), pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('23456789'), pick('!@#$%&*?')];
  while (c.length < 14) c.push(pick(all));
  return c.sort(() => rnd(1000) - 500).join('');
};
const suggestUsername = (name) => name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).slice(0, 2).join('.').slice(0, 30);

// Give an existing staff member a login: search their name, pick it, choose a role, set a temporary password.
export default function UserCreate() {
  const { t } = useTranslation('users');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roles = useLoad(() => (can('roles.read') ? roleApi.listRoles() : Promise.resolve([])), []);
  const [staff, setStaff] = useState(null);                     // the chosen staff member
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState(EMPTY); const [show, setShow] = useState(false);
  const [fe, setFe] = useState({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const choose = (s) => { setStaff(s); setSearch(''); setQ(''); setF((p) => ({ ...p, username: p.username || suggestUsername(s.fullName) })); };
  // Arriving from the Staff page ("Create account" button) pre-selects the person.
  const pre = params.get('staffId');
  useEffect(() => { if (pre) staffApi.get(pre).then((s) => { if (!s.hasAccount && s.isActive) choose(s); else setErr(t('create.unavailable')); }).catch((x) => setErr(errMsg(x))); }, [pre]); // eslint-disable-line
  useEffect(() => { const h = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(h); }, [search]);

  const canSearch = can('staff.read');
  const found = useLoad(() => (canSearch && !staff && q ? staffApi.list({ search: q, account: 'without', isActive: 'true', limit: 8 }) : Promise.resolve(null)), [q, staff, canSearch]);
  const results = found.data?.data || [];

  const roleList = (roles.data || []).filter((r) => r.code !== 'OWNER');
  const role = roleList.find((r) => r.id === f.roleId);
  const isSales = role?.code === 'SALESPERSON';
  const canPay = can('salespersons.view_commission');

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    const body = { staffId: staff.id, username: f.username, roleId: f.roleId, password: f.password };
    if (isSales) { body.region = f.region.trim() || null; if (canPay) { body.commissionRate = Number(f.commissionRate || 0); body.monthlyTarget = Number(f.monthlyTarget || 0); } }
    try {
      await userApi.create(body);
      navigate('/users', { state: { msg: t('create.created', { username: f.username, name: staff.fullName, role: role.name }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };

  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/users" className="text-sm hover:underline">{t('create.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <Banner>{err || roles.error}</Banner>
        <div className="max-w-xl space-y-4">
          {/* Step 1: find the person */}
          <Field label={t('create.staffMember')} error={fe.staffId}>
            {staff ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                <div><div className="font-medium">{staff.fullName}</div><div className="text-xs">{staff.code}{staff.position ? ` · ${staff.position}` : ''}{staff.phone ? ` · ${staff.phone}` : ''}</div></div>
                <button type="button" className="btn-ghost" onClick={() => setStaff(null)}>{t('create.change')}</button>
              </div>
            ) : (
              <>
                <input className="input !text-black" type="search" autoComplete="off" placeholder={canSearch ? t('create.searchPlaceholder') : t('create.noPermission')} disabled={!canSearch}
                  value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('create.searchAria')} />
                {q && !found.loading && (
                  <ul className="mt-1 divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                    {results.map((s) => (
                      <li key={s.id}><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => choose(s)}>
                        <span className="font-medium">{s.fullName}</span><span className="ml-2 text-xs">{s.code}{s.position ? ` · ${s.position}` : ''}{s.phone ? ` · ${s.phone}` : ''}</span>
                      </button></li>
                    ))}
                    {results.length === 0 && <li className="px-3 py-2 text-sm">{t('create.noMatch')} {can('staff.create') && <Link to="/staff/new" className="underline">{t('create.addOnStaff')}</Link>}</li>}
                  </ul>
                )}
                <p className="mt-1 text-xs">{t('create.onlyWithout')}</p>
              </>
            )}
          </Field>

          {/* Step 2: role + sign-in details */}
          {staff && (
            <>
              <Field label={t('create.role')} error={fe.roleId}>
                <select className="input !text-black" required value={f.roleId} onChange={set('roleId')}>
                  <option value="">{t('create.chooseRole')}</option>
                  {roleList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label={t('create.username')} error={fe.username}><input className="input !text-black" required autoComplete="off" maxLength={30} value={f.username} onChange={set('username')} /></Field>
              <Field label={t('create.tempPassword')} error={fe.password}>
                <div className="flex gap-2">
                  <input className="input !text-black" type={show ? 'text' : 'password'} required autoComplete="new-password" value={f.password} onChange={set('password')} />
                  <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setShow(!show)}>{show ? t('create.hide') : t('create.show')}</button>
                  <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => { setF({ ...f, password: makePassword() }); setShow(true); }}>{t('create.generate')}</button>
                </div>
              </Field>
              <p className="-mt-2 text-xs">{t('create.passwordRules')}</p>
              {isSales && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('create.region')} error={fe.region}><input className="input !text-black" maxLength={80} value={f.region} onChange={set('region')} /></Field>
                  <div className="hidden sm:block" />
                  {canPay && (
                    <>
                      <Field label={t('create.commission')} error={fe.commissionRate}><input className="input !text-black" type="number" min="0" max="100" step="0.01" value={f.commissionRate} onChange={set('commissionRate')} /></Field>
                      <Field label={t('create.target')} error={fe.monthlyTarget}><input className="input !text-black" type="number" min="0" step="0.01" value={f.monthlyTarget} onChange={set('monthlyTarget')} /></Field>
                    </>
                  )}
                  <p className="text-xs sm:col-span-2">{t('create.salesNote')}</p>
                </div>
              )}
              <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.submit')}</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

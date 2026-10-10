import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';

export default function LoginForm() {
  const { t } = useTranslation('auth');
  const { login } = useAuth();
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(f.username, f.password); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{t('signIn')}</h1>
      <Banner>{err}</Banner>
      <Field label={t('username')}><input className="input" autoComplete="username" autoFocus required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
      <Field label={t('password')}><input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button>
    </form>
  );
}
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx';

export default function ChangePasswordForm({ forced }) {
  const { t } = useTranslation('auth');
  const { reload, logout } = useAuth();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [ok, setOk] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setOk(false);
    if (f.newPassword !== f.confirm) return setFe({ confirm: t('passwordMismatch') });
    try {
      await authApi.changePassword(f.currentPassword, f.newPassword);
      setOk(true); setF({ currentPassword: '', newPassword: '', confirm: '' });
      if (forced) await reload();
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); }
  };
  const inp = 'input !text-[14px] !text-[#212121]';
  return (
    <div className={`relative flex items-center justify-center px-4 ${forced ? 'min-h-screen' : 'min-h-[70vh]'}`}>
      {forced && <div className="absolute right-4 top-4"><LanguageSwitcher /></div>}
      <div className="panel w-full max-w-md overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
        <div className="p-4 text-center">
          <h1 className="text-[18px] font-bold">{forced ? t('setNewPassword') : t('changePassword')}</h1>
          <p className="mt-0.5 text-[14px]">{forced ? t('forcedHint') : t('ruleHint')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-4 pb-4">
          <Banner>{err}</Banner><Banner kind="ok">{ok && t('passwordChanged')}</Banner>
          <Field label={t('currentPassword')} error={fe.currentPassword}><input className={inp} type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
          <Field label={t('newPassword')} error={fe.newPassword}><input className={inp} type="password" autoComplete="new-password" required value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
          <Field label={t('confirmPassword')} error={fe.confirm}><input className={inp} type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
          <div className="flex justify-center gap-2"><button className="btn-primary px-4 py-2 text-[14px] font-bold">{t('savePassword')}</button>{forced && <button type="button" className="btn-ghost text-[14px]" onClick={logout}>{t('signOut')}</button>}</div>
        </form>
      </div>
    </div>
  );
}
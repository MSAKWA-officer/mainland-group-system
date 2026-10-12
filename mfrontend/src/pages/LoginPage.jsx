import { useTranslation } from 'react-i18next';
import LoginForm from '../features/auth/LoginForm.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

export default function LoginPage() {
  const { t } = useTranslation('auth');
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-12 text-white md:flex">
        <div className="text-xl font-bold">Mainland Group</div>
        <div>
          <p className="max-w-md text-4xl font-bold leading-tight">{t('tagline')}</p>
          <p className="mt-4 max-w-md text-slate-300">{t('taglineSub')}</p>
        </div>
        <div className="text-xs text-slate-400">{t('accessLogged')}</div>
      </div>
      <div className="relative flex items-center justify-center p-6">
        <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
        <LoginForm />
      </div>
    </div>
  );
}
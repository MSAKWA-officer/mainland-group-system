import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errMsg } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import Banner from '../components/Banner.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

// Weka logo yako hapa: mfrontend/public/logo.png  (PNG/SVG/WEBP — badilisha jina hapa kama ni tofauti)
const LOGO = `${import.meta.env.BASE_URL}logo.png`;

const icon = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', 'aria-hidden': true };
const UserIcon = (p) => (<svg {...icon} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>);
const LockIcon = (p) => (<svg {...icon} {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>);
const EyeIcon = (p) => (<svg {...icon} {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
const EyeOffIcon = (p) => (<svg {...icon} {...p}><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19C5.6 19 2 12 2 12a18 18 0 0 1 4.1-5M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" /></svg>);
const ShieldIcon = (p) => (<svg {...icon} {...p}><path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>);

// Logo yenye fallback ya herufi "M" kama picha haipo
function Logo({ className = 'h-10 w-10' }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    <img src={LOGO} alt="Mainland Group" onError={() => setOk(false)} className={`${className} object-contain`} />
  ) : (
    <span className={`${className} flex items-center justify-center rounded-lg bg-brand font-bold text-white`}>M</span>
  );
}

export default function LoginPage() {
  const { t } = useTranslation('auth');
  const { login } = useAuth();
  const [f, setF] = useState({ username: '', password: '' });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(f.username, f.password); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-navy-900 via-ink to-navy-800">
      {/* Background: logo kubwa iliyofifia + mwanga wa rangi */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <img src={LOGO} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }}
          className="absolute left-1/2 top-1/2 w-[120vmin] max-w-none -translate-x-1/2 -translate-y-1/2 select-none object-contain opacity-[0.07] grayscale" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
        {/* Brand panel */}
        <aside className="hidden flex-col justify-between p-12 text-white lg:flex">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white p-1.5 shadow-lg">
              <Logo className="h-full w-full" />
            </span>
            <span className="text-xl font-semibold tracking-tight">Mainland Group</span>
          </div>
          <div>
            <p className="max-w-md text-4xl font-bold leading-tight tracking-tight">{t('tagline')}</p>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-300">{t('taglineSub')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldIcon className="h-4 w-4 shrink-0" />
            <span>{t('accessLogged')}</span>
          </div>
        </aside>

        {/* Form panel */}
        <main className="relative flex items-center justify-center px-6 py-12">
          <div className="absolute right-4 top-4 rounded-lg bg-white/90 shadow-sm backdrop-blur"><LanguageSwitcher /></div>
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 text-white lg:hidden">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5 shadow-lg">
                <Logo className="h-full w-full" />
              </span>
              <span className="text-lg font-semibold">Mainland Group</span>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/95 p-8 shadow-2xl shadow-black/30 backdrop-blur sm:p-10">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{t('signIn')}</h1>
              <div className="mt-1 h-1 w-10 rounded-full bg-brand" />

              <form onSubmit={submit} className="mt-6 space-y-5">
                <Banner>{err}</Banner>

                <div>
                  <label htmlFor="username" className="label">{t('username')}</label>
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input id="username" className="input !py-2.5 !pl-10" autoComplete="username" autoFocus required
                      value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="label">{t('password')}</label>
                  <div className="relative">
                    <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input id="password" className="input !py-2.5 !pl-10 !pr-11" type={show ? 'text' : 'password'}
                      autoComplete="current-password" required
                      value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
                    <button type="button" onClick={() => setShow((s) => !s)}
                      aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-mist hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">
                      {show ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button className="btn-primary w-full !py-2.5 text-base shadow-sm" disabled={busy}>
                  {busy && (
                    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
                      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                  {busy ? t('signingIn') : t('signIn')}
                </button>
              </form>
            </div>
            <p className="mt-6 text-center text-xs text-slate-300">&copy; {new Date().getFullYear()} Mainland Group</p>
          </div>
        </main>
      </div>
    </div>
  );
}

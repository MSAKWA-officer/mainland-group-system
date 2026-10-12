import { useTranslation } from 'react-i18next';
import { dashboardApi, monitoringApi, notificationApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../features/dashboard/Card.jsx';
import SecurityActivity, { SecurityStats } from '../features/dashboard/SecurityActivity.jsx';
import NotificationsPanel from '../features/dashboard/NotificationsPanel.jsx';
import ModuleSummary from '../features/dashboard/ModuleSummary.jsx';
import useLoad from '../utils/useLoad';

// Status strip at the top, like the registration-status box on the SIMS dashboard.
const TONES = {
  bad: 'border-[#d9534f] bg-[#f2dede] text-[#a94442]',
  warn: 'border-[#e0b04a] bg-[#fcf8e3] text-[#8a6d3b]',
  ok: 'border-[#7fbf7b] bg-[#dff0d8] text-[#3c763d]',
};
function Banner({ mon, notes }) {
  const { t } = useTranslation('dashboard');
  let tone; let head; let line;
  if (mon) {
    const issues = [];
    if (mon.lockedUsers) issues.push(t('issueLocked', { count: mon.lockedUsers }));
    if (mon.failedLogins24h) issues.push(t('issueFailed', { count: mon.failedLogins24h }));
    if (mon.denied24h) issues.push(t('issueDenied', { count: mon.denied24h }));
    head = t('securityHead');
    if (issues.length) { tone = mon.lockedUsers || mon.denied24h ? 'bad' : 'warn'; line = t('attention', { issues: issues.join(t('sep')) }); } else { tone = 'ok'; line = t('allClear'); }
  } else if (notes) {
    head = t('notifHead');
    if (notes.unread) { tone = 'warn'; line = t('unread', { count: notes.unread }); } else { tone = 'ok'; line = t('noUnread'); }
  } else return null;
  return (
    <div role="status" className={`mb-5 border px-4 py-3 text-sm font-bold leading-snug ${TONES[tone]}`}>
      <div>{head}</div><div>{line}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { user, can } = useAuth();
  const mon = useLoad(() => can('monitoring.read') ? monitoringApi.summary() : Promise.resolve(null), []);
  const notes = useLoad(() => can('notifications.read') ? notificationApi.list() : Promise.resolve(null), []);
  const sum = useLoad(() => dashboardApi.summary(), []);
  const modules = sum.data?.modules || [];
  const nothing = !mon.data && !notes.data && !modules.length;
  return (
    <div>
      <Banner mon={mon.data} notes={notes.data} />
      <Card title={t('title')} className="mb-5">
        <p className="text-sm text-slate-700">{t('welcome')} <span className="font-semibold">{user.fullName}</span></p>
        <p className="mt-0.5 text-sm text-mn-text">{t('roleSummary', { role: user.roleName, count: user.permissions.length })}</p>
        {mon.data && <div className="mt-4"><SecurityStats m={mon.data} /></div>}
        {nothing && !mon.loading && !notes.loading && !sum.loading && <p className="mt-4 text-sm text-mn-text">{t('useMenu')}</p>}
      </Card>

      {(sum.loading || sum.error || modules.length > 0) && (
        <section aria-labelledby="modules-heading" className="mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="modules-heading" className="text-[17px] font-bold text-[#555]">{t('modulesTitle')}</h2>
            <button type="button" onClick={sum.reload} disabled={sum.loading} className="text-sm text-mn-link hover:underline disabled:opacity-50">{t('refresh')}</button>
          </div>
          {sum.loading && !sum.data && <p className="text-sm text-slate-500" role="status">{t('loading')}</p>}
          {sum.error && <p className="text-sm text-danger" role="alert">{sum.error}</p>}
          <div className="space-y-5">{modules.map((mod) => <ModuleSummary key={mod.key} module={mod} />)}</div>
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {notes.data && <NotificationsPanel notes={notes.data} onReadAll={async () => { await notificationApi.readAll(); notes.reload(); }} />}
        {mon.data && <SecurityActivity m={mon.data} />}
      </div>
    </div>
  );
}

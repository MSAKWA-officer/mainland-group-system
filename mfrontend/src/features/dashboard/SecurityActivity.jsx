import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auditApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Pill from '../../components/Pill.jsx';
import Card from './Card.jsx';
import { fmt } from '../../utils/format';

const Stat = ({ label, value, tone }) => (
  <div className="border border-slate-200 px-3 py-2.5">
    <div className="text-xs text-mn-text">{label}</div>
    <div className={`mt-0.5 text-2xl font-bold ${tone || 'text-slate-800'}`}>{value}</div>
  </div>
);

// Counters shown inside the "Dashboard" card.
export function SecurityStats({ m }) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      <Stat label={t('statActiveUsers')} value={m.activeUsers} />
      <Stat label={t('statLiveSessions')} value={m.activeSessions} />
      <Stat label={t('statLockedAccounts')} value={m.lockedUsers} tone={m.lockedUsers ? 'text-danger' : ''} />
      <Stat label={t('statFailedLogins')} value={m.failedLogins24h} tone={m.failedLogins24h ? 'text-amber' : ''} />
      <Stat label={t('statDeniedActions')} value={m.denied24h} tone={m.denied24h ? 'text-danger' : ''} />
    </div>
  );
}

// Recent sign-in events plus the audit-chain check (the "News" card position).
export default function SecurityActivity({ m }) {
  const { t } = useTranslation('dashboard');
  const { can } = useAuth();
  const [chain, setChain] = useState(null);
  const verify = async () => { try { setChain(await auditApi.verify()); } catch (e) { setChain({ error: errMsg(e) }); } };
  return (
    <Card title={t('securityTitle')}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>{['colWhen', 'colUser', 'colEvent', 'colIp'].map((k) => <th key={k} className="border-b border-slate-200 py-2 pr-3 text-left font-bold text-mn-link">{t(k)}</th>)}</tr></thead>
          <tbody>
            {m.recent.length === 0 && <tr><td colSpan="4" className="py-4 text-slate-500">{t('noActivity')}</td></tr>}
            {m.recent.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{fmt(r.occurredAt)}</td>
                <td className="py-2 pr-3">{r.username || '—'}</td>
                <td className="py-2 pr-3"><Pill tone={r.outcome === 'SUCCESS' ? 'ok' : r.outcome === 'DENIED' ? 'bad' : 'warn'}>{t(`events.${r.action}`, { defaultValue: r.action })}</Pill></td>
                <td className="py-2 text-slate-600">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {can('audit.verify') && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="border border-mn bg-white px-3.5 py-1.5 text-sm text-mn-dark hover:bg-mn-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-mn" onClick={verify}>{t('verify')}</button>
          {chain && !chain.error && (chain.ok ? <Pill tone="ok">{t('intact', { count: chain.checked })}</Pill> : <Pill tone="bad">{t('tampering', { id: chain.brokenAtId })}</Pill>)}
          {chain?.error && <Pill tone="bad">{chain.error}</Pill>}
        </div>
      )}
    </Card>
  );
}
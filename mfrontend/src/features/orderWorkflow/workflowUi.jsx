import { useTranslation } from 'react-i18next';
import { CheckIcon, XIcon } from '../../components/Icons.jsx';
import { fmt } from '../../utils/format';

// Banners keep their light background but their text is black (same rule as the sales order screens).
export const NOTICE = '[&>div]:!text-black';

// Every status of order_workflows.status: colour, which stage it belongs to and who has to act.
// Maandishi (label, hint) yanatoka locales/<lugha>/orderWorkflow.json -> status.<CODE>.label / .hint
export const STATUS = {
  AWAITING_STOREKEEPER: { dot: 'bg-yellow-500', stage: 'STOREKEEPER', who: 'storekeeper' },
  AWAITING_MANAGER: { dot: 'bg-blue-500', stage: 'MANAGER', who: 'manager' },
  AWAITING_SALESPERSON: { dot: 'bg-indigo-500', stage: 'SALESPERSON', who: 'salesperson' },
  RETURNED: { dot: 'bg-orange-500', stage: 'SALESPERSON', who: 'salesperson' },
  COMPLETED: { dot: 'bg-emerald-600', stage: 'CLOSED', who: null },
  REJECTED: { dot: 'bg-red-500', stage: 'CLOSED', who: null },
  CANCELLED: { dot: 'bg-slate-400', stage: 'CLOSED', who: null },
};
export const STAGES = ['STOREKEEPER', 'MANAGER', 'SALESPERSON', 'CLOSED'];

// Translated names for statuses, stages, roles and hints. Used by every order-approval screen.
export function useWorkflowText() {
  const { t } = useTranslation('orderWorkflow');
  return {
    t,
    status: (s) => t(`status.${s}.label`, { defaultValue: s }),
    hint: (s) => t(`status.${s}.hint`, { defaultValue: '' }),
    stage: (st) => t(`stages.${st}`, { defaultValue: st }),
    role: (r) => (r ? t(`roles.${r}`, { defaultValue: r }) : ''),
    waitingOn: (s) => (STATUS[s] ? t(`stages.${STATUS[s].stage}`) : '—'),
  };
}

// Status as black text with a coloured dot.
export const StatusDot = ({ status }) => {
  const x = useWorkflowText();
  const dot = STATUS[status]?.dot || 'bg-slate-400';
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 rounded-full ${dot}`} />{x.status(status)}</span>;
};

/* ---------- the four-step tracker ---------- */
const STEPS = [
  { key: 'submit', who: 'submitter', at: 'submittedAt' },
  { key: 'verify', who: 'storekeeper', at: 'storekeeperAt' },
  { key: 'decide', who: 'manager', at: 'managerAt' },
  { key: 'confirm', who: 'completer', at: 'completedAt' },
];
// done | current | returned | rejected | todo, one per step.
export function stepStates(wf) {
  const st = ['done', 'todo', 'todo', 'todo'];
  switch (wf.status) {
    case 'AWAITING_STOREKEEPER': st[1] = 'current'; break;
    case 'AWAITING_MANAGER': st[1] = 'done'; st[2] = 'current'; break;
    case 'AWAITING_SALESPERSON': st[1] = 'done'; st[2] = 'done'; st[3] = 'current'; break;
    case 'COMPLETED': st.fill('done'); break;
    case 'RETURNED': if (wf.returnedFrom === 'MANAGER') { st[1] = 'done'; st[2] = 'returned'; } else st[1] = 'returned'; break;
    case 'REJECTED': st[1] = 'done'; st[2] = 'rejected'; break;
    case 'CANCELLED': if (wf.storekeeperAt) st[1] = 'done'; break;
    default: break;
  }
  return st;
}
const CIRCLE = {
  done: 'bg-emerald-600 text-white', current: 'bg-blue-600 text-white ring-4 ring-blue-100', returned: 'bg-orange-500 text-white',
  rejected: 'bg-red-500 text-white', todo: 'border-2 border-line bg-white text-slate-500',
};
const CAPTION = { done: 'done', current: 'waiting', returned: 'returned', rejected: 'rejected', todo: '' };

export function Tracker({ wf }) {
  const { t } = useTranslation('orderWorkflow');
  const st = stepStates(wf);
  return (
    <ol className="grid gap-4 sm:grid-cols-4" aria-label={t('tracker.aria')}>
      {STEPS.map((p, i) => {
        const name = wf[p.who]?.fullName; const at = st[i] === 'done' || st[i] === 'returned' || st[i] === 'rejected' ? wf[p.at] : null;
        return (
          <li key={p.key} className="relative flex gap-3 text-black sm:flex-col sm:items-center sm:text-center" aria-current={st[i] === 'current' ? 'step' : undefined}>
            {i > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-4 hidden h-0.5 w-[calc(100%+1rem)] -translate-y-1/2 sm:block ${st[i - 1] === 'done' ? 'bg-emerald-600' : 'bg-line'}`} />}
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${CIRCLE[st[i]]}`}>
              {st[i] === 'done' ? <CheckIcon width="16" height="16" /> : st[i] === 'rejected' ? <XIcon width="16" height="16" /> : i + 1}
            </span>
            <div className="text-sm">
              <div className="font-medium">{t(`tracker.steps.${p.key}`)}</div>
              {CAPTION[st[i]] && <div className="text-xs font-medium uppercase tracking-wide">{t(`tracker.captions.${CAPTION[st[i]]}`)}</div>}
              {name && <div className="text-xs">{name}</div>}
              {at && <div className="text-xs">{fmt(at)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- history ---------- */
const EVENT_DOT = {
  SUBMITTED: 'bg-yellow-500', RESUBMITTED: 'bg-yellow-500', STOREKEEPER_VERIFIED: 'bg-blue-500', STOREKEEPER_RETURNED: 'bg-orange-500',
  MANAGER_APPROVED: 'bg-indigo-500', MANAGER_REJECTED: 'bg-red-500', MANAGER_RETURNED: 'bg-orange-500', ACKNOWLEDGED: 'bg-emerald-600', CANCELLED: 'bg-slate-400',
};
const pretty = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

export function Timeline({ events }) {
  const { t } = useTranslation('orderWorkflow');
  if (!events?.length) return <p className="text-sm text-black">{t('timeline.empty')}</p>;
  const cycles = [...new Set(events.map((e) => e.cycle))].sort((a, b) => a - b);
  return (
    <div className="space-y-5">
      {cycles.map((c) => (
        <div key={c}>
          {cycles.length > 1 && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-black">{t('attempt', { n: c })}</h3>}
          <ol className="space-y-3 border-l border-line pl-5">
            {events.filter((e) => e.cycle === c).map((e) => {
              const dot = EVENT_DOT[e.action] || 'bg-slate-400';
              return (
                <li key={e.id} className="relative text-sm text-black">
                  <span aria-hidden="true" className={`absolute -left-[1.62rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${dot}`} />
                  <div className="font-medium">{t(`events.${e.action}`, { defaultValue: pretty(e.action) })}</div>
                  <div className="text-xs">{e.actor?.fullName || e.actorName || t('timeline.unknownUser')} ({t(`actorRoles.${e.actorRole}`, { defaultValue: pretty(e.actorRole) })}) · {fmt(e.createdAt)}</div>
                  {e.note && <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2">{e.note}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

// The "your turn" signal: any action flag set by the API for the current user.
export const hasAction = (wf) => Object.values(wf?.actions || {}).some(Boolean);

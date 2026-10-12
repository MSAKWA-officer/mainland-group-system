import { Link } from 'react-router-dom';
import { orderWorkflowApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useLoad from '../../utils/useLoad';
import { STATUS, StatusDot, Tracker, useWorkflowText } from './workflowUi.jsx';

// Compact approval tracking for one sales order. Drop it into the sales order screen:
//   <OrderWorkflowPanel orderId={r.id} key={`${r.status}-${r.submittedAt}`} />
// Renders nothing for a draft that was never submitted, or an order from before Phase 4 (no workflow row).
export default function OrderWorkflowPanel({ orderId }) {
  const x = useWorkflowText();
  const { t } = x;
  const { can } = useAuth();
  const q = useLoad(() => orderWorkflowApi.byOrder(orderId), [orderId]);
  const wf = q.data;
  if (!wf) return null;
  const who = STATUS[wf.status]?.who;
  return (
    <section className="border-t border-line px-6 py-5 text-black" aria-label={t('panel.title')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('panel.title')} <span className="ml-2 text-sm font-normal"><StatusDot status={wf.status} />{wf.cycle > 1 ? ` · ${t('attempt', { n: wf.cycle })}` : ''}</span></h2>
        {can('order_workflow.read') && <Link to={`/order-workflow/${wf.id}`} className="text-sm text-black underline">{t('panel.openDetails')}</Link>}
      </div>
      <Tracker wf={wf} />
      {wf.status === 'RETURNED' && wf.returnNote && (
        <p className="mt-4 whitespace-pre-wrap rounded-md border border-line bg-slate-50 px-4 py-3 text-sm"><strong>{t('panel.returned', { role: x.role((wf.returnedFrom || '').toLowerCase()) })}</strong> {wf.returnNote}</p>
      )}
      {wf.status === 'REJECTED' && wf.managerNote && (
        <p className="mt-4 whitespace-pre-wrap rounded-md border border-line bg-slate-50 px-4 py-3 text-sm"><strong>{t('panel.rejected')}</strong> {wf.managerNote}</p>
      )}
      {who && <p className="mt-3 text-sm">{t('waitingFor', { role: x.role(who) })}</p>}
    </section>
  );
}

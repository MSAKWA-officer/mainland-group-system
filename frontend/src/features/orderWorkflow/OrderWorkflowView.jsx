import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { orderWorkflowApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { day, money } from '../salesOrders/SalesOrdersList.jsx';
import WorkflowActions from './WorkflowActions.jsx';
import { NOTICE, STATUS, StatusDot, Timeline, Tracker, hasAction, useWorkflowText } from './workflowUi.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);
const Section = ({ title, children }) => (<section className="mt-6"><h2 className="mb-2 text-base font-semibold">{title}</h2>{children}</section>);
const LINE_COLS = ['sku', 'item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal'];

export default function OrderWorkflowView() {
  const x = useWorkflowText();
  const { t } = x;
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const q = useLoad(() => orderWorkflowApi.get(id), [id]);
  const wf = q.data; const o = wf?.order; const meta = wf && STATUS[wf.status];
  const lines = o?.lines || [];
  const showStock = lines.some((l) => l.available !== undefined && l.available !== null);   // the API may include the stock on hand for the storekeeper
  const done = (m) => { setMsg(m); setErr(''); q.reload(); };
  const note = (label, who, at, text) => text && (
    <div className="mt-3 rounded-md border border-line bg-slate-50 px-4 py-3 text-sm text-black">
      <div className="font-medium">{label}{who ? ` - ${who}` : ''}{at ? ` · ${fmt(at)}` : ''}</div><p className="mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  );
  const returnedRole = x.role((wf?.returnedFrom || '').toLowerCase());
  const heads = [...LINE_COLS.slice(0, 3), ...(showStock ? ['inStock'] : []), ...LINE_COLS.slice(3)];
  const headLabel = (k) => (k === 'inStock' ? t('view.inStock') : t(`lines.${k}`));
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{o ? o.orderNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{wf ? <><StatusDot status={wf.status} /> · {t('attempt', { n: wf.cycle })}</> : tc('loading')}</p>
        </div>
        <Link to="/order-workflow" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.backToList')}</Link>
      </div>
      {(err || msg || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg || location.state?.msg}</Banner></div>
      )}
      {wf && (
        <div className="border-t border-line px-6 py-5">
          <Tracker wf={wf} />

          <div className="mt-6 rounded-md border border-line px-4 py-3 text-sm text-black">
            <p>{hasAction(wf) || wf.actions?.editAndResubmit ? <strong>{t('yourTurnSentence')} </strong> : meta?.who ? <strong>{t('waitingFor', { role: x.role(meta.who) })} </strong> : null}{x.hint(wf.status)}</p>
            <div className="mt-3 empty:hidden"><WorkflowActions wf={wf} onDone={done} onError={setErr} /></div>
          </div>

          {wf.status === 'RETURNED' && note(t('view.returnedBy', { role: returnedRole }), wf.returner?.fullName, wf.returnedAt, wf.returnNote)}
          {wf.status === 'REJECTED' && note(t('view.rejected'), wf.manager?.fullName, wf.managerAt, wf.managerNote)}
          {['AWAITING_MANAGER', 'AWAITING_SALESPERSON', 'COMPLETED'].includes(wf.status) && note(t('view.storekeeperNote'), wf.storekeeper?.fullName, wf.storekeeperAt, wf.storekeeperNote)}
          {['AWAITING_SALESPERSON', 'COMPLETED'].includes(wf.status) && note(t('view.managerNote'), wf.manager?.fullName, wf.managerAt, wf.managerNote)}
          {wf.status === 'COMPLETED' && note(t('view.salespersonNote'), wf.completer?.fullName, wf.completedAt, wf.completedNote)}

          {o && (
            <Section title={t('view.order')}>
              <dl className="max-w-3xl">
                <Row label={t('view.orderNo')}>{can('sales_orders.read') ? <Link to={`/sales-orders/${wf.orderId}`} className="text-black underline">{o.orderNo}</Link> : o.orderNo}</Row>
                <Row label={t('view.customer')}>{o.customer && `${o.customer.name} (${o.customer.code})`}</Row>
                <Row label={t('view.salesperson')}>{o.salesperson && `${o.salesperson.fullName} (${o.salesperson.code})`}</Row>
                <Row label={t('view.orderDate')}>{o.orderDate && day(o.orderDate)}</Row>
                <Row label={t('view.deliveryDate')}>{o.deliveryDate && day(o.deliveryDate)}</Row>
                <Row label={t('view.notes')}>{o.notes}</Row>
                <Row label={t('view.submitted')}>{wf.submittedAt && (wf.submitter?.fullName ? t('view.submittedBy', { when: fmt(wf.submittedAt), who: wf.submitter.fullName }) : fmt(wf.submittedAt))}</Row>
              </dl>
            </Section>
          )}

          {lines.length > 0 && (
            <Section title={t('view.items')}>
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[40rem]">
                  <thead className="bg-slate-50"><tr>{heads.map((k) => <th key={k} className="th px-3 py-2 font-normal uppercase text-black">{headLabel(k)}</th>)}</tr></thead>
                  <tbody>
                    {lines.map((l) => {
                      const short = showStock && Number(l.available) < Number(l.quantity);
                      return (
                        <tr key={l.id} className="odd:bg-slate-50/60">
                          <td className="td whitespace-nowrap px-3 text-black">{l.sku}</td>
                          <td className="td px-3 text-black">{l.itemName}</td>
                          <td className="td whitespace-nowrap px-3 text-black">{Number(l.quantity)} {l.unit}</td>
                          {showStock && <td className="td whitespace-nowrap px-3 text-black">{Number(l.available)} {l.unit}{short && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-black">{t('view.short')}</span>}</td>}
                          <td className="td px-3 text-right text-black">{money(l.unitPrice)}</td>
                          <td className="td px-3 text-right text-black">{Number(l.discountPercent)}</td>
                          <td className="td px-3 text-right text-black">{money(l.lineTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm text-black">
                <div className="flex justify-between"><dt>{t('totals.subtotal')}</dt><dd>{money(o.subtotal)}</dd></div>
                <div className="flex justify-between"><dt>{t('totals.discount')}</dt><dd>{money(o.discountTotal)}</dd></div>
                <div className="flex justify-between"><dt>{t('totals.tax', { rate: Number(o.taxRate || 0) })}</dt><dd>{money(o.taxTotal)}</dd></div>
                <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>{t('totals.total')}</dt><dd>{money(o.total)}</dd></div>
              </dl>
            </Section>
          )}

          <Section title={t('view.history')}><Timeline events={wf.events} /></Section>
        </div>
      )}
    </div>
  );
}

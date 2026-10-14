import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { salesOrderApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import OrderWorkflowPanel from '../orderWorkflow/OrderWorkflowPanel.jsx';
import { METHOD } from '../sales/saleUi.jsx';
import { NOTICE, RowActions, SaleLink, SaleType, Status, day, money } from './SalesOrdersList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

const LINE_COLS = ['sku', 'item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal'];

export default function SalesOrdersView() {
  const { t } = useTranslation('salesOrders');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => salesOrderApi.get(id), [id]);
  const r = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.orderNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status status={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/sales-orders" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.backToList')}</Link>
      </div>
      {(err || q.error || ok || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{ok || location.state?.msg}</Banner></div>
      )}
      {r && ['SUBMITTED', 'DRAFT'].includes(r.status) && <div className={`px-6 ${NOTICE}`}><Banner kind="ok">{t(`view.willCreate${r.saleType === 'CREDIT' ? 'Credit' : 'Cash'}`)}</Banner></div>}
      {r && <OrderWorkflowPanel orderId={r.id} key={`${r.status}-${r.submittedAt}`} />}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.saleType')}><SaleType type={r.saleType} /></Row>
            <Row label={t('view.customer')}>{r.customer && (can('customers.read')
              ? <Link to={`/customers/${r.customer.id}`} className="text-black underline">{r.customer.name} ({r.customer.code})</Link> : `${r.customer.name} (${r.customer.code})`)}</Row>
            <Row label={t('view.customerPhone')}>{r.customer?.phone}</Row>
            <Row label={t('view.salesperson')}>{r.salesperson && `${r.salesperson.fullName} (${r.salesperson.code})`}</Row>
            <Row label={t('view.orderDate')}>{day(r.orderDate)}</Row>
            <Row label={t('view.deliveryDate')}>{r.deliveryDate && day(r.deliveryDate)}</Row>
            {r.saleType === 'CASH' && <Row label={t('view.paymentMethod')}>{r.paymentMethod && METHOD[r.paymentMethod]}</Row>}
            {r.saleType === 'CASH' && <Row label={t('view.paymentReference')}>{r.paymentReference}</Row>}
            {r.saleType === 'CREDIT' && <Row label={t('view.dueDate')}>{r.dueDate && day(r.dueDate)}</Row>}
            <Row label={t('view.paymentTerms')}>{r.customer && t('view.paymentTermsDays', { count: r.customer.paymentTermsDays })}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.createdBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.submitted')}>{r.submittedAt && fmt(r.submittedAt)}</Row>
            <Row label={t('view.decisionNote')}>{r.approval?.decisionNote}</Row>
            <Row label={t('view.confirmed')}>{r.confirmedAt && fmt(r.confirmedAt)}</Row>
            <Row label={t('view.stockDocument')}>{r.stockDocument?.docNo}</Row>
            <Row label={t('view.sale')}>{r.sale ? <><SaleLink order={r} /> · {t(`saleType.${r.sale.saleType}`)} · {t(`view.saleStatus.${r.sale.status}`, { defaultValue: r.sale.status })}</> : (r.status === 'CONFIRMED' ? null : t('view.saleNotYet'))}</Row>
            <Row label={t('view.cancelled')}>{r.cancelledAt && fmt(r.cancelledAt)}</Row>
            <Row label={t('view.cancelReason')}>{r.cancelReason}</Row>
          </dl>

          <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.items')}</h2>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50"><tr>{LINE_COLS.map((k) => <th key={k} className="th px-3 py-2 font-normal uppercase text-black">{t(`lines.${k}`)}</th>)}</tr></thead>
              <tbody>
                {(r.lines || []).map((l) => (
                  <tr key={l.id} className="odd:bg-slate-50/60">
                    <td className="td whitespace-nowrap px-3 text-black">{l.sku}</td>
                    <td className="td px-3 text-black">{l.itemName}</td>
                    <td className="td whitespace-nowrap px-3 text-black">{Number(l.quantity)} {l.unit}</td>
                    <td className="td px-3 text-right text-black">{money(l.unitPrice)}</td>
                    <td className="td px-3 text-right text-black">{Number(l.discountPercent)}</td>
                    <td className="td px-3 text-right text-black">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm text-black">
            <div className="flex justify-between"><dt>{t('totals.subtotal')}</dt><dd>{money(r.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>{t('totals.discount')}</dt><dd>{money(r.discountTotal)}</dd></div>
            <div className="flex justify-between"><dt>{t('totals.tax', { rate: Number(r.taxRate) })}</dt><dd>{money(r.taxTotal)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>{t('totals.total')}</dt><dd>{money(r.total)}</dd></div>
          </dl>

          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={(m) => { setErr(m); if (m) setOk(''); }} onNotice={(m) => { setOk(m); setErr(''); }} afterDelete={() => navigate('/sales-orders', { state: { msg: t('actions.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

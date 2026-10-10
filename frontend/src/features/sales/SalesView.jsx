import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { saleApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { METHOD, NOTICE, PayStatus, SaleType, Status, customerName, day, money } from './saleUi.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

const LINE_COLS = ['sku', 'item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal'];
const PAY_COLS = ['receipt', 'date', 'method', 'reference', 'receivedBy', 'amount', 'state'];

// Read-only detail of any sale. Actions (approve, receive payment, void ...) live in the Cash sales / Credit sales screens.
export default function SalesView() {
  const { t } = useTranslation('sales');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const q = useLoad(() => saleApi.get(id), [id]);
  const r = q.data;
  const credit = r?.saleType === 'CREDIT';
  const balance = r && r.status === 'COMPLETED' ? Number(r.balance) : 0;
  const owner = r && (credit ? 'credit-sales' : 'cash-sales');
  const ownerPerm = r && (credit ? 'credit_sales.read' : 'cash_sales.read');
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.saleNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-4 text-sm">{r ? <><SaleType type={r.saleType} /><Status status={r.status} />{r.status === 'COMPLETED' && <PayStatus status={r.paymentStatus} />}</> : tc('loading')}</p>
        </div>
        <Link to="/sales" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.backToList')}</Link>
      </div>
      {(q.error || location.state?.msg) && <div className={`px-6 ${NOTICE}`}><Banner>{q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          {r.isOverdue && <div className={NOTICE}><Banner>{t('view.overdueBanner', { amount: money(r.balance), date: day(r.dueDate) })}</Banner></div>}
          <dl className="max-w-3xl">
            <Row label={t('view.customer')}>{r.customer
              ? (can('customers.read') ? <Link to={`/customers/${r.customer.id}`} className="text-black underline">{r.customer.name} ({r.customer.code})</Link> : `${r.customer.name} (${r.customer.code})`)
              : customerName(r)}</Row>
            <Row label={t('view.customerPhone')}>{r.customer?.phone || r.walkInPhone}</Row>
            <Row label={t('view.salesperson')}>{r.salesperson && `${r.salesperson.fullName} (${r.salesperson.code})`}</Row>
            <Row label={t('view.saleDate')}>{day(r.saleDate)}</Row>
            {credit && <Row label={t('view.dueDate')}>{day(r.dueDate)}</Row>}
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.createdBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            {credit && <Row label={t('view.submitted')}>{r.submittedAt && fmt(r.submittedAt)}</Row>}
            {credit && <Row label={t('view.decisionNote')}>{r.approval?.decisionNote}</Row>}
            <Row label={t('view.completed')}>{r.completedAt && fmt(r.completedAt)}</Row>
            <Row label={t('view.stockDocument')}>{r.stockDocument?.docNo}</Row>
            {r.status === 'VOIDED' && <><Row label={t('view.voided')}>{fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
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
            {r.status === 'COMPLETED' && <>
              <div className="flex justify-between"><dt>{t('view.paid')}</dt><dd>{money(r.amountPaid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>{t('view.balance')}</dt><dd>{money(balance)}</dd></div>
            </>}
          </dl>

          <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.payments')}</h2>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50"><tr>{PAY_COLS.map((k) => <th key={k} className="th px-3 py-2 font-normal uppercase text-black">{t(`paymentCols.${k}`)}</th>)}</tr></thead>
              <tbody>
                {(r.payments || []).length === 0 && <tr><td className="td px-3 text-black" colSpan={PAY_COLS.length}>{t('view.noPayments')}</td></tr>}
                {(r.payments || []).map((p) => (
                  <tr key={p.id} className="odd:bg-slate-50/60">
                    <td className="td whitespace-nowrap px-3 text-black">{p.receiptNo}</td>
                    <td className="td whitespace-nowrap px-3 text-black">{day(p.paidOn)}</td>
                    <td className="td px-3 text-black">{METHOD[p.method] || p.method}</td>
                    <td className="td px-3 text-black">{p.reference || '—'}</td>
                    <td className="td px-3 text-black">{p.receiver?.fullName}</td>
                    <td className="td px-3 text-right text-black">{money(p.amount)}</td>
                    <td className="td px-3 text-black">{p.voidedAt ? <span title={p.voidReason}>{t('view.paymentVoided')}</span> : t('view.paymentValid')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {can(ownerPerm) && (
            <p className="mt-4 pb-2 text-sm">
              <Trans i18nKey={credit ? 'view.ownerHintCredit' : 'view.ownerHintCash'} ns="sales" components={{ l: <Link to={`/${owner}/${r.id}`} className="underline" /> }} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { paymentHistoryApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { METHOD, NOTICE, PayStatus, SaleType, day, money } from '../sales/saleUi.jsx';
import { Row } from '../customerReports/reportUi.jsx';

// Read-only receipt. Payments are recorded and voided from the sale itself.
export default function PaymentHistoryView() {
  const { t } = useTranslation('paymentHistory');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const { can } = useAuth();
  const q = useLoad(() => paymentHistoryApi.get(id), [id]);
  const p = q.data;
  const salePerm = p?.saleType === 'CASH' ? 'cash_sales.read' : 'credit_sales.read';
  const saleUrl = p ? `/${p.saleType === 'CASH' ? 'cash-sales' : 'credit-sales'}/${p.saleId}` : '';
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{p ? p.receiptNo : t('view.fallbackTitle')}</h1>
          {p && <p className="mt-1 text-sm">{p.isVoided ? <span className="font-semibold text-red-600">{t('view.voided')}</span> : t('view.activeReceipt')}</p>}
        </div>
        <Link to="/payment-history" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {q.error && <div className={`px-6 ${NOTICE}`}><Banner>{q.error}</Banner></div>}
      {q.loading && !p && <p className="px-6 pb-6 text-sm">{tc('loading')}</p>}
      {p && (
        <dl className="max-w-3xl px-6 pb-6">
          <Row label={t('view.amount')}>{money(p.amount)}</Row>
          {p.tendered != null && <Row label={t('view.cashHanded')}>{t('view.cashHandedValue', { tendered: money(p.tendered), change: money(Number(p.tendered) - Number(p.amount)) })}</Row>}
          <Row label={t('view.paymentDate')}>{day(p.paidOn)}</Row>
          <Row label={t('view.method')}>{METHOD[p.method] || p.method}</Row>
          <Row label={t('view.reference')}>{p.reference}</Row>
          <Row label={t('view.customer')}>{p.customerId && can('customer_balances.read')
            ? <Link className="underline" to={`/customer-balances/${p.customerId}`}>{p.customerName}</Link> : p.customerName}</Row>
          <Row label={t('view.sale')}>
            {can(salePerm) ? <Link className="underline" to={saleUrl}>{p.saleNo}</Link> : p.saleNo} <span className="ml-2"><SaleType type={p.saleType} /></span>
          </Row>
          <Row label={t('view.saleTotal')}>{t('view.saleTotalPaid', { total: money(p.saleTotal), paid: money(p.saleAmountPaid) })} · <PayStatus status={p.salePaymentStatus} /></Row>
          <Row label={t('view.receivedBy')}>{p.receivedBy}</Row>
          <Row label={t('view.recorded')}>{fmt(p.createdAt)}</Row>
          <Row label={t('view.notes')}>{p.notes}</Row>
          {p.isVoided && <>
            <Row label={t('view.voidedOn')}>{fmt(p.voidedAt)}</Row>
            <Row label={t('view.voidedBy')}>{p.voidedByName}</Row>
            <Row label={t('view.voidReason')}>{p.voidReason}</Row>
          </>}
        </dl>
      )}
    </div>
  );
}

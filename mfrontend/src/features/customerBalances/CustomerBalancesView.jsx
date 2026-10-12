import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { customerBalanceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { METHOD, NOTICE, day, money } from '../sales/saleUi.jsx';
import { Stat } from '../customerReports/reportUi.jsx';

// One customer's balance: position, the invoices still open and the latest payments.
export default function CustomerBalancesView() {
  const { t } = useTranslation('customerBalances');
  const { customerId } = useParams();
  const { can } = useAuth();
  const q = useLoad(() => customerBalanceApi.get(customerId), [customerId]);
  const d = q.data; const p = d?.position;
  const bucket = (code) => t(`bucket.${code}`, { defaultValue: code });
  const invHeads = ['saleNo', 'saleDate', 'dueDate', 'total', 'paid', 'balance', 'age'];
  const payHeads = ['receipt', 'date', 'sale', 'method', 'reference', 'amount'];
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{d ? d.customer.name : t('detail.fallbackTitle')}</h1>
          {d && <p className="mt-1 text-sm">{d.customer.code}{d.customer.phone && ` · ${d.customer.phone}`}{!d.customer.isActive && ` · ${t('inactive')}`}</p>}
        </div>
        <Link to="/customer-balances" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('detail.back')}</Link>
      </div>
      {q.error && <div className={`px-6 ${NOTICE}`}><Banner>{q.error}</Banner></div>}
      {q.loading && !d && <p className="px-6 pb-6 text-sm">{t('detail.loading')}</p>}
      {d && (
        <div className="space-y-6 px-6 pb-6">
          {p && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label={t('detail.balance')} value={money(p.balance)} />
              <Stat label={t('detail.overdue')} value={money(p.overdue)} tone={Number(p.overdue) > 0 ? 'text-red-600' : ''} />
              <Stat label={t('detail.creditLimit')} value={money(p.creditLimit)} />
              <Stat label={t('detail.availableCredit')} value={money(p.availableCredit)} tone={p.overLimit ? 'text-red-600' : ''} />
            </div>
          )}
          {p?.overLimit && <Banner>{t('detail.overLimitBanner')}</Banner>}
          <div className="flex flex-wrap gap-2">
            {can('payment_history.read') && <Link className="btn-ghost" to={`/payment-history?customerId=${customerId}`}>{t('detail.paymentHistory')}</Link>}
            {can('credit_ageing.read') && <Link className="btn-ghost" to={`/credit-ageing/${customerId}`}>{t('detail.creditAgeing')}</Link>}
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t('detail.openInvoices')}</h2>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full">
                <thead className="bg-slate-50"><tr>{invHeads.map((h) => <th key={h} className="th px-4 py-3 font-normal uppercase text-black">{t(`detail.${h}`)}</th>)}</tr></thead>
                <tbody>
                  {d.openInvoices.length === 0 && <tr><td className="td px-4 text-black" colSpan={7}>{t('detail.noOpenInvoices')}</td></tr>}
                  {d.openInvoices.map((i) => (
                    <tr key={i.id} className="odd:bg-slate-50/60">
                      <td className="td px-4 font-medium text-black">{can('credit_sales.read') ? <Link className="underline" to={`/credit-sales/${i.id}`}>{i.saleNo}</Link> : i.saleNo}</td>
                      <td className="td whitespace-nowrap px-4 text-black">{day(i.saleDate)}</td>
                      <td className="td whitespace-nowrap px-4 text-black">{day(i.dueDate)}</td>
                      <td className="td whitespace-nowrap px-4 text-right text-black">{money(i.total)}</td>
                      <td className="td whitespace-nowrap px-4 text-right text-black">{money(i.amountPaid)}</td>
                      <td className="td whitespace-nowrap px-4 text-right font-semibold text-black">{money(i.balance)}</td>
                      <td className={`td px-4 ${i.daysOverdue > 0 ? 'font-semibold text-red-600' : 'text-black'}`}>{i.daysOverdue > 0 ? t('detail.daysOverdue', { count: i.daysOverdue }) : bucket(i.bucket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t('detail.latestPayments')}</h2>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full">
                <thead className="bg-slate-50"><tr>{payHeads.map((h) => <th key={h} className="th px-4 py-3 font-normal uppercase text-black">{t(`detail.${h}`)}</th>)}</tr></thead>
                <tbody>
                  {d.recentPayments.length === 0 && <tr><td className="td px-4 text-black" colSpan={6}>{t('detail.noPayments')}</td></tr>}
                  {d.recentPayments.map((x) => (
                    <tr key={x.id} className="odd:bg-slate-50/60">
                      <td className="td px-4 font-medium text-black">{can('payment_history.read') ? <Link className="underline" to={`/payment-history/${x.id}`}>{x.receiptNo}</Link> : x.receiptNo}</td>
                      <td className="td whitespace-nowrap px-4 text-black">{day(x.paidOn)}</td>
                      <td className="td px-4 text-black">{x.saleNo}</td>
                      <td className="td px-4 text-black">{METHOD[x.method] || x.method}</td>
                      <td className="td px-4 text-black">{x.reference || '—'}</td>
                      <td className="td whitespace-nowrap px-4 text-right font-semibold text-black">{money(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

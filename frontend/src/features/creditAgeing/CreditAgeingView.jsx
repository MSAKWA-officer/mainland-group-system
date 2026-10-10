import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { creditAgeingApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, day, money } from '../sales/saleUi.jsx';
import { BUCKETS, Stat } from '../customerReports/reportUi.jsx';

const COLS = ['saleNo', 'saleDate', 'dueDate', 'total', 'paid', 'balance', 'daysOverdue', 'bucket'];

// One customer's open credit invoices, each with its age. Optional ?asOf=YYYY-MM-DD shows the position on a past date.
export default function CreditAgeingView() {
  const { t } = useTranslation('creditAgeing');
  const { t: tc } = useTranslation('common');
  const { customerId } = useParams();
  const [params] = useSearchParams();
  const asOf = params.get('asOf') || '';
  const { can } = useAuth();
  const q = useLoad(() => creditAgeingApi.get(customerId, asOf ? { asOf } : undefined), [customerId, asOf]);
  const d = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{d ? d.customer.name : t('view.fallbackTitle')}</h1>
          {d && <p className="mt-1 text-sm">{t('view.subtitle', { code: d.customer.code, date: asOf ? day(asOf) : t('view.today') })}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can('customer_balances.read') && <Link className="btn-ghost" to={`/customer-balances/${customerId}`}>{t('view.customerBalance')}</Link>}
          <Link to="/credit-ageing" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
        </div>
      </div>
      {q.error && <div className={`px-6 ${NOTICE}`}><Banner>{q.error}</Banner></div>}
      {q.loading && !d && <p className="px-6 pb-6 text-sm">{tc('loading')}</p>}
      {d && (
        <div className="space-y-6 px-6 pb-6">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={t('outstanding')} value={money(d.summary.outstanding)} />
            {BUCKETS.map((b) => <Stat key={b.key} label={t(`bucket.${b.code}`)} value={money(d.summary[b.key])} tone={b.key !== 'current' && Number(d.summary[b.key]) > 0 ? 'text-red-600' : ''} />)}
          </div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full">
              <thead className="bg-slate-50"><tr>{COLS.map((k) => <th key={k} className="th px-4 py-3 font-normal uppercase text-black">{t(`view.columns.${k}`)}</th>)}</tr></thead>
              <tbody>
                {d.invoices.length === 0 && <tr><td className="td px-4 text-black" colSpan={COLS.length}>{asOf ? t('view.noInvoicesOnDate') : `${t('view.noInvoices')}.`}</td></tr>}
                {d.invoices.map((i) => (
                  <tr key={i.id} className="odd:bg-slate-50/60">
                    <td className="td px-4 font-medium text-black">{can('credit_sales.read') ? <Link className="underline" to={`/credit-sales/${i.id}`}>{i.saleNo}</Link> : i.saleNo}</td>
                    <td className="td whitespace-nowrap px-4 text-black">{day(i.saleDate)}</td>
                    <td className="td whitespace-nowrap px-4 text-black">{day(i.dueDate)}</td>
                    <td className="td whitespace-nowrap px-4 text-right text-black">{money(i.total)}</td>
                    <td className="td whitespace-nowrap px-4 text-right text-black">{money(i.amountPaid)}</td>
                    <td className="td whitespace-nowrap px-4 text-right font-semibold text-black">{money(i.balance)}</td>
                    <td className={`td px-4 ${i.daysOverdue > 0 ? 'font-semibold text-red-600' : 'text-black'}`}>{i.daysOverdue > 0 ? i.daysOverdue : '—'}</td>
                    <td className="td px-4 text-black">{t(`bucket.${i.bucket}`, { defaultValue: i.bucket })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

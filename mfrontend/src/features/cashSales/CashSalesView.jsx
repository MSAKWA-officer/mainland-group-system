import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { cashSaleApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { METHOD, NOTICE, Status, customerName, day, money } from '../sales/saleUi.jsx';
import { ACCOUNT_KIND, accountLabel, splitReference } from '../sales/paymentProviders.js';
import { RowActions } from './CashSalesList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

export default function CashSalesView() {
  const { t } = useTranslation('cashSales');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => cashSaleApi.get(id), [id]);
  const r = q.data;
  const pay = r?.payments?.[0];
  const split = pay ? splitReference(pay.method, pay.reference) : { provider: '', ref: '' };
  const change = pay?.tendered != null ? Number(pay.tendered) - Number(pay.amount) : null;
  const heads = ['sku', 'item', 'quantity', 'unitPrice', 'discountPercent', 'lineTotal'];
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.saleNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status status={r.status} /> : t('view.loading')}</p>
        </div>
        <Link to="/cash-sales" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.customer')}>{r.customer && can('customers.read')
              ? <Link to={`/customers/${r.customer.id}`} className="text-black underline">{r.customer.name} ({r.customer.code})</Link> : customerName(r)}</Row>
            <Row label={t('view.phone')}>{r.customer?.phone || r.walkInPhone}</Row>
            <Row label={t('view.salesperson')}>{r.salesperson && `${r.salesperson.fullName} (${r.salesperson.code})`}</Row>
            <Row label={t('view.saleDate')}>{day(r.saleDate)}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.servedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.completed')}>{r.completedAt && fmt(r.completedAt)}</Row>
            <Row label={t('view.stockDocument')}>{r.stockDocument?.docNo}</Row>
            {r.status === 'VOIDED' && <><Row label={t('view.voided')}>{fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>

          <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.items')}</h2>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50"><tr>{heads.map((h) => <th key={h} className="th px-3 py-2 font-normal uppercase text-black">{t(`view.${h}`)}</th>)}</tr></thead>
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
            <div className="flex justify-between"><dt>{t('view.subtotal')}</dt><dd>{money(r.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>{t('view.discount')}</dt><dd>{money(r.discountTotal)}</dd></div>
            <div className="flex justify-between"><dt>{t('view.tax', { rate: Number(r.taxRate) })}</dt><dd>{money(r.taxTotal)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>{t('view.total')}</dt><dd>{money(r.total)}</dd></div>
          </dl>

          {pay && (
            <>
              <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.payment')}</h2>
              <dl className="max-w-3xl">
                <Row label={t('view.receiptNo')}>{pay.receiptNo}</Row>
                <Row label={t('view.method')}>{METHOD[pay.method] || pay.method}</Row>
                {(pay.bankAccount || split.provider) && <Row label={t(ACCOUNT_KIND[pay.method] === 'network' ? 'view.network' : 'view.bank')}>{pay.bankAccount ? accountLabel(pay.bankAccount) : split.provider}</Row>}
                <Row label={t('view.reference')}>{split.ref}</Row>
                <Row label={t('view.amount')}>{money(pay.amount)}</Row>
                {pay.tendered != null && <><Row label={t('view.receivedAmount')}>{money(pay.tendered)}</Row><Row label={t('view.changeGiven')}>{money(change)}</Row></>}
                <Row label={t('view.takenBy')}>{pay.receiver?.fullName}</Row>
                {pay.voidedAt && <Row label={t('view.payment')}>{t('view.paymentVoided', { reason: pay.voidReason })}</Row>}
              </dl>
            </>
          )}
          <div className="mt-4 pb-2"><RowActions r={r} onChanged={q.reload} onError={setErr} /></div>
        </div>
      )}
    </div>
  );
}

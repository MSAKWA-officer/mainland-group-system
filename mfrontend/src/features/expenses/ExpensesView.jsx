import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { expenseApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { METHOD, NOTICE, Row, Stat, day, money } from '../banking/bankingUi.jsx';
import { ExpenseStatus, RowActions } from './ExpensesList.jsx';
import { PaymentStatus } from '../payments/PaymentsList.jsx';

const PAY_COLS = ['paymentNo', 'date', 'method', 'amount', 'status'];

export default function ExpensesView() {
  const { t } = useTranslation('expenses');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => expenseApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const approved = r?.status === 'APPROVED';
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.expenseNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-4 text-sm">{r ? <><ExpenseStatus value={r.status} />{approved && <ExpenseStatus pay value={r.paymentStatus} />}</> : tc('loading')}</p>
        </div>
        <Link to="/expenses" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-3">
            <Stat label={t('view.amount')} value={money(r.amount)} />
            {approved && <Stat label={t('view.paid')} value={money(r.paidAmount)} />}
            {approved && <Stat label={t('view.stillToPay')} value={money(r.outstandingAmount)} tone={Number(r.outstandingAmount) > 0 ? 'text-red-600' : ''} />}
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.category')}>{t(`category.${r.category}`, { defaultValue: r.category })}</Row>
            <Row label={t('view.description')}>{r.description}</Row>
            <Row label={t('view.payee')}>{r.payee}</Row>
            <Row label={t('view.reference')}>{r.reference}</Row>
            <Row label={t('view.expenseDate')}>{day(r.expenseDate)}</Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.submittedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('view.submitted')}>{fmt(r.createdAt)}</Row>
            {['APPROVED', 'REJECTED'].includes(r.status) && <>
              <Row label={r.status === 'APPROVED' ? t('view.approvedBy') : t('view.rejectedBy')}>{r.decider?.fullName}</Row>
              <Row label={t('view.decidedOn')}>{r.decidedAt && fmt(r.decidedAt)}</Row>
              <Row label={t('view.decisionNote')}>{r.decisionNote}</Row>
            </>}
            {r.status === 'VOIDED' && <><Row label={t('view.voidedBy')}>{r.voider?.fullName}</Row><Row label={t('view.voidedOn')}>{r.voidedAt && fmt(r.voidedAt)}</Row><Row label={t('view.voidReason')}>{r.voidReason}</Row></>}
          </dl>

          {(approved || (r.payments || []).length > 0) && (<>
            <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.paymentsTitle')}</h2>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[34rem]">
                <thead className="bg-slate-50"><tr>{PAY_COLS.map((k) => <th key={k} className={`th px-3 py-2 font-normal uppercase text-black ${k === 'amount' ? 'text-right' : ''}`}>{t(`view.cols.${k}`)}</th>)}</tr></thead>
                <tbody>
                  {(r.payments || []).length === 0 && <tr><td className="td px-3 text-black" colSpan={PAY_COLS.length}>{t('view.noPayments')}</td></tr>}
                  {(r.payments || []).map((p) => (
                    <tr key={p.id} className="odd:bg-slate-50/60">
                      <td className="td whitespace-nowrap px-3 text-black">{can('payments.read') ? <Link to={`/payments/${p.id}`} className="underline">{p.paymentNo}</Link> : p.paymentNo}</td>
                      <td className="td whitespace-nowrap px-3 text-black">{day(p.paidOn)}</td>
                      <td className="td px-3 text-black">{METHOD[p.method] || p.method}</td>
                      <td className={`td px-3 text-right ${p.status === 'VOIDED' ? 'text-slate-500 line-through' : 'text-black'}`}>{money(p.amount)}</td>
                      <td className="td px-3"><PaymentStatus value={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={(m) => { setOk(m || ''); setErr(''); q.reload(); }} onError={(m) => { setErr(m); if (m) setOk(''); }} />
          </div>
        </div>
      )}
    </div>
  );
}

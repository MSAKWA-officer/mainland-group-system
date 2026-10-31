import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { approvalApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pill from '../../components/Pill.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { saleCan, saleLink } from '../../utils/saleLink.js';
import { METHOD, PayStatus, Status, day, money } from '../sales/saleUi.jsx';
import { accountLabel, splitReference } from '../sales/paymentProviders.js';
import { RowActions, TONE, useApprovalText } from './ApprovalsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium text-slate-500">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);
const Section = ({ title, children }) => <section className="mt-6"><h2 className="mb-2 text-base font-semibold">{title}</h2>{children}</section>;
const NOTE = { ok: 'border-emerald-200 bg-emerald-50 text-emerald-800', warn: 'border-amber-200 bg-amber-50 text-amber-800', bad: 'border-red-200 bg-red-50 text-red-700' };
const Note = ({ tone, children }) => <div className={`rounded-md border px-3 py-2 text-sm font-medium ${NOTE[tone]}`}>{children}</div>;

// heads: [label, alignRight?]
const Tbl = ({ heads, min = '40rem', children }) => (
  <div className="overflow-x-auto rounded-md border border-line">
    <table className="w-full" style={{ minWidth: min }}>
      <thead className="bg-slate-50"><tr>{heads.map(([label, right], i) => <th key={i} className={`th px-3 py-2 font-normal uppercase ${right ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

/* ---------- items of a sale / sales order ---------- */
function Lines({ lines, t }) {
  const d = (k) => t(`details.${k}`);
  return (
    <Tbl heads={[[d('sku')], [d('item')], [d('quantity')], [d('unitPrice'), true], [d('discountPercent'), true], [d('lineTotal'), true]]}>
      {(lines || []).map((l) => (
        <tr key={l.id} className="odd:bg-slate-50/60">
          <td className="td whitespace-nowrap px-3">{l.sku}</td>
          <td className="td px-3">{l.itemName}</td>
          <td className="td whitespace-nowrap px-3">{Number(l.quantity)} {l.unit}</td>
          <td className="td px-3 text-right">{money(l.unitPrice)}</td>
          <td className="td px-3 text-right">{Number(l.discountPercent)}</td>
          <td className="td px-3 text-right">{money(l.lineTotal)}</td>
        </tr>
      ))}
    </Tbl>
  );
}

function Totals({ d, t, sale }) {
  const line = (k, v, strong) => <div className={`flex justify-between ${strong ? 'font-semibold' : ''}`}><dt>{k}</dt><dd>{money(v)}</dd></div>;
  return (
    <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
      {line(t('details.subtotal'), d.subtotal)}
      {line(t('details.discount'), d.discountTotal)}
      {line(t('details.tax', { rate: Number(d.taxRate) }), d.taxTotal)}
      <div className="border-t border-line pt-1 text-base">{line(t('details.total'), d.total, true)}</div>
      {sale && d.saleType === 'CREDIT' && <>{line(t('details.paid'), d.amountPaid)}{line(t('details.balance'), d.balance, true)}</>}
      {sale && d.saleType === 'CASH' && line(t('details.paid'), d.amountPaid)}
    </dl>
  );
}

/* ---------- payments received on a sale ---------- */
function Payments({ d, t }) {
  const list = d.payments || [];
  const anyTendered = list.some((p) => p.tendered != null);
  const payAccount = (p) => (p.bankAccount ? accountLabel(p.bankAccount) : splitReference(p.method, p.reference).provider);
  const heads = [[t('details.receipt')], [t('details.date')], [t('details.method')], [t('details.reference')], [t('details.receivedBy')], [t('details.amount'), true]];
  if (anyTendered) heads.push([t('details.tendered'), true], [t('details.change'), true]);
  heads.push([t('details.state')]);
  return (
    <Tbl heads={heads} min="44rem">
      {list.length === 0 && <tr><td className="td px-3" colSpan={heads.length}>{t('details.noPayments')}</td></tr>}
      {list.map((p) => (
        <tr key={p.id} className={`odd:bg-slate-50/60 ${p.voidedAt ? 'line-through decoration-slate-400' : ''}`}>
          <td className="td whitespace-nowrap px-3">{p.receiptNo}</td>
          <td className="td whitespace-nowrap px-3">{p.paidOn ? day(p.paidOn) : fmt(p.createdAt)}</td>
          <td className="td px-3">{METHOD[p.method] || p.method}{payAccount(p) && <div className="text-xs">{payAccount(p)}</div>}</td>
          <td className="td px-3">{splitReference(p.method, p.reference).ref || '—'}</td>
          <td className="td px-3">{p.receiver?.fullName}</td>
          <td className="td px-3 text-right">{money(p.amount)}</td>
          {anyTendered && <>
            <td className="td px-3 text-right">{p.tendered != null ? money(p.tendered) : '—'}</td>
            <td className="td px-3 text-right">{p.tendered != null ? money(Number(p.tendered) - Number(p.amount)) : '—'}</td>
          </>}
          <td className="td px-3" title={p.voidReason || undefined}>{p.voidedAt ? t('details.voided') : t('details.valid')}</td>
        </tr>
      ))}
    </Tbl>
  );
}

/* ---------- credit position + debts of the customer (credit sales / credit orders) ---------- */
function CreditBox({ c, total, t, can }) {
  const k = (key, o) => t(`details.credit.${key}`, o);
  const limit = Number(c.creditLimit);
  const cell = (label, value, bad) => <div><div className="text-xs uppercase">{label}</div><b className={bad ? 'text-red-600' : ''}>{money(value)}</b></div>;
  return (
    <div className="space-y-3">
      <Note tone={c.hasDebt ? (Number(c.otherOverdue) > 0 ? 'bad' : 'warn') : 'ok'}>
        {c.hasDebt ? k('hasDebt', { amount: money(c.otherDebt), count: c.openSales.length }) : k('noDebt')}
      </Note>
      <div className="rounded-md border border-line p-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          {cell(k('limit'), c.creditLimit)}
          {cell(k('outstanding'), c.outstanding)}
          {cell(k('available'), c.available)}
          {cell(k('overdue'), c.overdue, Number(c.overdue) > 0)}
        </div>
        {c.afterApproval != null && (
          <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-4">
            {cell(k('thisSale'), total)}
            {cell(k('afterApproval'), c.afterApproval, c.overLimit)}
            {cell(k('availableAfter'), c.availableAfter, Number(c.availableAfter) < 0)}
          </div>
        )}
        <p className="mt-3 text-xs">{k('terms', { count: c.paymentTermsDays })}</p>
      </div>
      {limit <= 0 && <Note tone="bad">{k('noLimit')}</Note>}
      {c.overLimit && limit > 0 && <Note tone="bad">{k('overLimit', { total: money(total), available: money(c.available) })}</Note>}
      {Number(c.otherOverdue) > 0 && <Note tone="bad">{k('hasOverdue', { amount: money(c.otherOverdue) })}</Note>}
      {c.openSales.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{k('openSales')}</h3>
          <Tbl heads={[[k('saleNo')], [k('saleDate')], [k('dueDate')], [k('total'), true], [k('paid'), true], [k('balance'), true], [k('state')]]} min="42rem">
            {c.openSales.map((s) => (
              <tr key={s.id} className="odd:bg-slate-50/60">
                <td className="td whitespace-nowrap px-3">{saleCan(can, 'CREDIT') ? <Link to={saleLink(s.id, 'CREDIT')} className="underline">{s.saleNo}</Link> : s.saleNo}</td>
                <td className="td whitespace-nowrap px-3">{day(s.saleDate)}</td>
                <td className="td whitespace-nowrap px-3">{day(s.dueDate)}</td>
                <td className="td px-3 text-right">{money(s.total)}</td>
                <td className="td px-3 text-right">{money(s.amountPaid)}</td>
                <td className="td px-3 text-right font-semibold">{money(s.balance)}</td>
                <td className={`td px-3 ${s.isOverdue ? 'font-semibold text-red-600' : ''}`}>{s.isOverdue ? k('overdueState') : k('openState')}</td>
              </tr>
            ))}
          </Tbl>
        </div>
      )}
    </div>
  );
}

/* ---------- sale (cash / credit) or sales order ---------- */
function SaleDetails({ d, t, can }) {
  const sale = d.kind === 'SALE';
  const cust = d.customer;
  const no = sale ? d.saleNo : d.orderNo;
  return (
    <>
      <Section title={t(sale ? 'details.sale' : 'details.order')}>
        <dl className="max-w-3xl">
          <Row label={t('details.number')}>{no}</Row>
          <Row label={t('details.type')}>{t(`details.saleTypes.${d.saleType}`, { defaultValue: d.saleType })}</Row>
          <Row label={t('details.status')}><span className="flex flex-wrap items-center gap-4"><Status status={d.status} />{sale && d.status === 'COMPLETED' && <PayStatus status={d.paymentStatus} />}</span></Row>
          <Row label={t('details.customer')}>{cust
            ? (can('customers.read') ? <Link to={`/customers/${cust.id}`} className="underline">{cust.name} ({cust.code})</Link> : `${cust.name} (${cust.code})`)
            : (d.walkInName || t('details.walkIn'))}</Row>
          <Row label={t('details.phone')}>{cust?.phone || d.walkInPhone}</Row>
          <Row label={t('details.address')}>{cust && [cust.address, cust.city].filter(Boolean).join(', ')}</Row>
          <Row label={t('details.salesperson')}>{d.salesperson && `${d.salesperson.fullName} (${d.salesperson.code})`}</Row>
          <Row label={t('details.date')}>{day(sale ? d.saleDate : d.orderDate)}</Row>
          {!sale && <Row label={t('details.deliveryDate')}>{d.deliveryDate && day(d.deliveryDate)}</Row>}
          {d.saleType === 'CREDIT' && <Row label={t('details.dueDate')}>{d.dueDate && day(d.dueDate)}</Row>}
          {!sale && d.saleType === 'CASH' && <>
            <Row label={t('details.method')}>{METHOD[d.paymentMethod] || d.paymentMethod}</Row>
            <Row label={t('details.reference')}>{d.paymentReference}</Row>
          </>}
          <Row label={t('details.createdBy')}>{d.creator?.fullName}</Row>
          <Row label={t('details.notes')}>{d.notes}</Row>
          {sale && <Row label={t('details.stockDocument')}>{d.stockDocument?.docNo}</Row>}
          {sale && d.order && <Row label={t('details.fromOrder')}>{d.order.orderNo}</Row>}
          {sale && d.voidedAt && <Row label={t('details.voidReason')}>{d.voidReason}</Row>}
        </dl>
        <p className="mt-2 text-sm">
          {sale && saleCan(can, d.saleType) && <Link to={saleLink(d.id, d.saleType)} className="text-blue-600 hover:underline">{t('details.openRecord')}</Link>}
          {!sale && can('sales_orders.read') && <Link to={`/sales-orders/${d.id}`} className="text-blue-600 hover:underline">{t('details.openRecord')}</Link>}
        </p>
      </Section>

      <Section title={t('details.items')}>
        <Lines lines={d.lines} t={t} />
        <Totals d={d} t={t} sale={sale} />
      </Section>

      {sale && (d.saleType === 'CASH' || (d.payments || []).length > 0) && <Section title={t('details.payments')}><Payments d={d} t={t} /></Section>}

      {d.credit && <Section title={t('details.credit.title')}><CreditBox c={d.credit} total={d.total} t={t} can={can} /></Section>}
    </>
  );
}

/* ---------- stock document (receiving, adjustment, reject in/out, expired, damaged ...) ---------- */
function StockDetails({ d, t }) {
  const totalQty = (d.lines || []).reduce((a, l) => a + Number(l.quantity || 0), 0);
  return (
    <>
      <Section title={t('details.stockDoc')}>
        <dl className="max-w-3xl">
          <Row label={t('details.number')}>{d.docNo}</Row>
          <Row label={t('details.type')}>{t(`details.stockTypes.${d.type}`, { defaultValue: d.type })}</Row>
          <Row label={t('details.status')}>{d.status}</Row>
          <Row label={t('details.date')}>{d.docDate && day(d.docDate)}</Row>
          <Row label={t('details.warehouse')}>{d.warehouse && `${d.warehouse.name} (${d.warehouse.code})`}</Row>
          <Row label={t('details.party')}>{d.partyName}</Row>
          <Row label={t('details.reference')}>{d.reference}</Row>
          <Row label={t('details.reason')}>{d.reason}</Row>
          <Row label={t('details.createdBy')}>{d.creator?.fullName}</Row>
        </dl>
      </Section>
      <Section title={t('details.items')}>
        <Tbl min="46rem" heads={[[t('details.sku')], [t('details.item')], [t('details.direction')], [t('details.quantity'), true], [t('details.unitCost'), true], [t('details.batch')], [t('details.expiry')], [t('details.remarks')]]}>
          {(d.lines || []).map((l) => (
            <tr key={l.id} className="odd:bg-slate-50/60">
              <td className="td whitespace-nowrap px-3">{l.item?.sku}</td>
              <td className="td px-3">{l.item?.name}</td>
              <td className="td px-3">{t(`details.dir.${l.direction}`, { defaultValue: l.direction })}</td>
              <td className="td whitespace-nowrap px-3 text-right">{Number(l.quantity)} {l.item?.unit}</td>
              <td className="td px-3 text-right">{l.unitCost != null ? money(l.unitCost) : '—'}</td>
              <td className="td px-3">{l.batchNo || '—'}</td>
              <td className="td whitespace-nowrap px-3">{l.expiryDate ? day(l.expiryDate) : '—'}</td>
              <td className="td px-3">{l.remarks || '—'}</td>
            </tr>
          ))}
        </Tbl>
        <p className="mt-2 text-right text-sm font-semibold">{t('details.totalQuantity')}: {totalQty}</p>
      </Section>
    </>
  );
}

// Request types that have no linked record page yet: show whatever the request itself carries.
function PayloadRows({ payload, t }) {
  const rows = Object.entries(payload || {}).filter(([k, v]) => k !== 'note' && v !== null && typeof v !== 'object');
  if (!rows.length) return null;
  return <Section title={t('details.request')}><dl className="max-w-3xl">{rows.map(([k, v]) => <Row key={k} label={k}>{String(v)}</Row>)}</dl></Section>;
}

export default function ApprovalsView() {
  const x = useApprovalText();
  const { t } = x;
  const { can } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => approvalApi.get(id), [id]);
  const r = q.data;
  const d = r?.details;
  return (
    <div className="panel overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? x.type(r.type) : t('view.defaultTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Pill tone={TONE[r.status]}>{x.status(r.status)}</Pill> : t('view.loading')}</p>
        </div>
        <Link to="/approvals" className="text-sm text-blue-600 hover:underline">{t('view.back')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <Section title={t('details.request')}>
            <dl className="max-w-3xl">
              <Row label={t('view.requestedBy')}>{r.requester?.fullName}</Row>
              <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
              <Row label={t('view.submitted')}>{r.submittedAt && fmt(r.submittedAt)}</Row>
              <Row label={t('view.note')}>{r.payload?.note}</Row>
              <Row label={t('view.decision')}>{r.decider && `${r.decider.fullName}, ${fmt(r.decidedAt)}`}</Row>
              <Row label={t('view.decisionNote')}>{r.decisionNote}</Row>
              <Row label={t('view.executed')}>{r.executedAt && fmt(r.executedAt)}</Row>
            </dl>
          </Section>

          {(d?.kind === 'SALE' || d?.kind === 'SALES_ORDER') && <SaleDetails d={d} t={t} can={can} />}
          {d?.kind === 'STOCK_DOCUMENT' && <StockDetails d={d} t={t} />}
          {!d && r.entityType && <div className="mt-6"><Note tone="warn">{t('details.missing')}</Note></div>}
          {!d && <PayloadRows payload={r.payload} t={t} />}

          <div className="mt-6 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr}
              afterDelete={() => navigate('/approvals', { state: { msg: t('view.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

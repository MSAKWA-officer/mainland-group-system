import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { salespersonApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, RowActions, Status, money } from './SalespersonsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function SalespersonsView() {
  const { t } = useTranslation('salespersons');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [err, setErr] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const q = useLoad(() => salespersonApi.get(id), [id]);
  const perf = useLoad(() => salespersonApi.summary(id, month), [id, month]);
  const r = q.data; const p = perf.data;
  const hasPay = r && r.commissionRate !== undefined;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.fullName : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status active={r.isActive} /> : t('loading', { ns: 'common' })}</p>
        </div>
        <Link to="/salespersons" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.code')}>{r.code}</Row>
            <Row label={t('view.name')}>{r.fullName}</Row>
            <Row label={t('view.region')}>{r.region}</Row>
            <Row label={t('view.warehouse')}>{r.warehouse ? `${r.warehouse.code} — ${r.warehouse.name}` : ''}</Row>
            <Row label={t('view.phone')}>{r.phone}</Row>
            <Row label={t('view.email')}>{r.email}</Row>
            <Row label={t('view.loginAccount')}>{r.user && `${r.user.fullName} (${r.user.username})`}</Row>
            {hasPay && <Row label={t('view.commissionRate')}>{`${Number(r.commissionRate)}%`}</Row>}
            {hasPay && <Row label={t('view.monthlyTarget')}>{money(r.monthlyTarget)}</Row>}
            <Row label={t('view.customers')}>{String(r.customerCount ?? 0)}</Row>
            <Row label={t('view.orders')}>{String(r.orderCount ?? 0)}</Row>
            <Row label={t('view.status')}><Status active={r.isActive} /></Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/salespersons', { state: { msg: t('view.deleted') } })} />
          </div>
        </div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t('perf.title')}</h2>
              <p className="text-sm">{t('perf.subtitle')}</p>
            </div>
            <input type="month" className="input max-w-[11rem]" aria-label={t('perf.monthAria')} value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </div>
          <div className={`mt-3 ${NOTICE}`}><Banner>{perf.error}</Banner></div>
          {p && (
            <dl className="mt-2 max-w-3xl">
              <Row label={t('perf.confirmedOrders')}>{String(p.confirmedOrders)}</Row>
              <Row label={t('perf.netSales')}>{money(p.netSales)}</Row>
              <Row label={t('perf.grossTotal')}>{money(p.grossTotal)}</Row>
              <Row label={t('perf.pendingApproval')}>{String(p.pendingOrders)}</Row>
              <Row label={t('perf.activeCustomers')}>{String(p.activeCustomers)}</Row>
              {p.monthlyTarget !== undefined && <Row label={t('perf.target')}>{money(p.monthlyTarget)}</Row>}
              {p.monthlyTarget !== undefined && <Row label={t('perf.targetReached')}>{p.attainmentPercent == null ? t('perf.noTarget') : `${p.attainmentPercent}%`}</Row>}
              {p.commissionEarned !== undefined && <Row label={t('perf.commissionEarned')}>{money(p.commissionEarned)}</Row>}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

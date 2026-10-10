import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { customerApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, RowActions, Status, TYPES, money } from './CustomersList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

export default function CustomersView() {
  const { t } = useTranslation('customers');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => customerApi.get(id), [id]);
  const r = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.name : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status active={r.isActive} /> : t('loading', { ns: 'common' })}</p>
        </div>
        <Link to="/customers" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.code')}>{r.code}</Row>
            <Row label={t('view.name')}>{r.name}</Row>
            <Row label={t('view.type')}>{t(`types.${r.type}`, { defaultValue: r.type })}</Row>
            <Row label={t('view.contactPerson')}>{r.contactPerson}</Row>
            <Row label={t('view.phone')}>{r.phone}</Row>
            <Row label={t('view.email')}>{r.email}</Row>
            <Row label={t('view.address')}>{r.address}</Row>
            <Row label={t('view.city')}>{r.city}</Row>
            <Row label={t('view.tin')}>{r.tin}</Row>
            <Row label={t('view.creditLimit')}>{money(r.creditLimit)}</Row>
            <Row label={t('view.paymentTerms')}>{t(r.paymentTermsDays === 1 ? 'view.paymentDaysOne' : 'view.paymentDaysOther', { count: r.paymentTermsDays })}</Row>
            <Row label={t('view.salesperson')}>{r.salesperson && `${r.salesperson.fullName} (${r.salesperson.code})`}</Row>
            <Row label={t('view.orders')}>{String(r.orderCount ?? 0)}</Row>
            <Row label={t('view.status')}><Status active={r.isActive} /></Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/customers', { state: { msg: t('view.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

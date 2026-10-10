import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { discountApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, RowActions, Status, day, qty } from './DiscountsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

export default function DiscountsView() {
  const { t } = useTranslation('discounts');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => discountApi.get(id), [id]);
  const r = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.name : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status r={r} /> : tc('loading')}</p>
        </div>
        <Link to="/discounts" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('form.backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.code')}>{r.code}</Row>
            <Row label={t('view.name')}>{r.name}</Row>
            <Row label={t('view.description')}>{r.description}</Row>
            <Row label={t('view.percent')}>{`${Number(r.percent)}%`}</Row>
            <Row label={t('view.scope')}>{t(`scope.${r.scope}`, { defaultValue: r.scope })}</Row>
            {r.scope === 'CATEGORY' && <Row label={t('view.category')}>{r.category?.name}</Row>}
            {r.scope === 'ITEM' && <Row label={t('view.item')}>{r.item && (can('items.read')
              ? <Link to={`/items/${r.item.id}`} className="text-black underline">{r.item.name} ({r.item.sku})</Link> : `${r.item.name} (${r.item.sku})`)}</Row>}
            <Row label={t('view.customer')}>{r.customer ? (can('customers.read')
              ? <Link to={`/customers/${r.customer.id}`} className="text-black underline">{r.customer.name} ({r.customer.code})</Link> : `${r.customer.name} (${r.customer.code})`) : t('anyCustomer')}</Row>
            <Row label={t('view.minQty')}>{Number(r.minQuantity) ? qty(r.minQuantity) : t('view.none')}</Row>
            <Row label={t('view.validFrom')}>{day(r.validFrom)}</Row>
            <Row label={t('view.validTo')}>{r.validTo ? day(r.validTo) : t('view.noEndDate')}</Row>
            <Row label={t('view.used')}>{String(r.usageCount ?? 0)}</Row>
            <Row label={t('view.status')}><Status r={r} /></Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/discounts', { state: { msg: t('actions.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

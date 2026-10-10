import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { movementApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { qty } from '../stock/StockList.jsx';
import { RowActions, docPath, money, useMovementText } from './MovementsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd>{children || '—'}</dd>
  </div>
);

export default function MovementsView() {
  const { t } = useTranslation('movements');
  const text = useMovementText();
  const { id } = useParams();
  const { can } = useAuth();
  const q = useLoad(() => movementApi.get(id), [id]);
  const m = q.data;
  const path = m && docPath(m, can);
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{m ? t('view.title', { id: m.id }) : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{m ? text.type(m.movementType) : t('loading', { ns: 'common' })}</p>
        </div>
        <Link to="/movements" className="text-sm hover:underline">{t('view.backToList')}</Link>
      </div>
      {q.error && <div className="px-6"><Banner>{q.error}</Banner></div>}
      {m && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.dateTime')}>{fmt(m.occurredAt)}</Row>
            <Row label={t('view.type')}>{text.type(m.movementType)}</Row>
            <Row label={t('view.document')}>{path ? <Link to={path} className="underline">{m.document.docNo}</Link> : m.document?.docNo}</Row>
            <Row label={t('view.reference')}>{m.document?.reference}</Row>
            <Row label={t('view.party')}>{m.document?.partyName}</Row>
            <Row label={t('view.item')}>{m.item && `${m.item.name} (${m.item.sku})`}</Row>
            <Row label={t('view.batch')}>{m.batch?.batchNo}</Row>
            <Row label={t('view.expiryDate')}>{m.batch?.expiryDate}</Row>
            <Row label={t('view.direction')}>{text.direction(m.direction)}</Row>
            <Row label={t('view.quantity')}>{`${qty(m.quantity)} ${m.item?.unit || ''}`}</Row>
            <Row label={t('view.balanceAfter')}>{`${qty(m.balanceAfter)} ${m.item?.unit || ''}`}</Row>
            {can('items.view_cost') && <Row label={t('view.unitCost')}>{m.unitCost != null ? money(m.unitCost) : ''}</Row>}
            <Row label={t('view.performedBy')}>{m.performer?.fullName}</Row>
            <Row label={t('view.note')}>{m.note}</Row>
          </dl>
          <div className="mt-4 pb-2"><RowActions m={m} /></div>
        </div>
      )}
    </div>
  );
}

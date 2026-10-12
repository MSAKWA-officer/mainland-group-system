import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { itemApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { fmt } from '../../utils/format';
import { RowActions, money, qty } from './ItemsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd>{children || '—'}</dd>
  </div>
);

export default function ItemsView() {
  const { t } = useTranslation('items');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(location.state?.msg || '');
  const q = useLoad(() => itemApi.get(id), [id]);
  const i = q.data;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-[18px] font-bold">{i ? i.name : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-[14px]">{i ? i.sku : tc('loading')}</p>
        </div>
        <Link to="/items" className="text-[14px] hover:underline">{t('backToList')}</Link>
      </div>
      {(err || q.error || msg) && <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {i && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('fields.itemName')}>{i.name}</Row>
            <Row label={t('fields.sku')}>{i.sku}</Row>
            <Row label={t('fields.barcode')}>{i.barcode}</Row>
            <Row label={t('fields.category')}>{i.category?.name}</Row>
            <Row label={t('fields.unit')}>{i.unit}</Row>
            <Row label={t('fields.stock')}>{`${qty(i.stock?.quantity)} ${i.unit}`}</Row>
            <Row label={t('fields.reorder')}>{qty(i.reorderLevel)}</Row>
            {can('items.view_cost') && <Row label={t('fields.costPrice')}>{money(i.costPrice)}</Row>}
            <Row label={t('fields.sellingPrice')}>{money(i.sellingPrice)}</Row>
            <Row label={t('fields.trackExpiry')}>{i.trackExpiry ? t('yes') : t('no')}</Row>
            <Row label={t('fields.status')}>{i.isActive ? tc('active') : tc('inactive')}</Row>
            <Row label={t('fields.description')}>{i.description}</Row>
            <Row label={t('fields.created')}>{fmt(i.createdAt)}</Row>
            <Row label={t('fields.updated')}>{fmt(i.updatedAt)}</Row>
          </dl>
          {i.trackExpiry && (
            <div className="mt-6 max-w-3xl">
              <h2 className="mb-2 text-[14px] font-bold">{t('view.batches')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white">
                  <thead><tr>{['batchNo', 'expiryDate', 'quantity'].map((h, n) => <th key={h} className={`${HEAD} ${al(n)}`}>{t(`view.${h}`)}</th>)}</tr></thead>
                  <tbody>
                    {(i.batches || []).length === 0 && <tr><td className={`${CELL} text-left`} colSpan={3}>{t('view.noBatches')}</td></tr>}
                    {(i.batches || []).map((b) => (
                      <tr key={b.id} className="bg-white">
                        <td className={`${CELL} text-left`}>{b.batchNo}</td><td className={`${CELL} text-center`}>{b.expiryDate}</td><td className={`${CELL} text-center`}>{qty(b.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="mt-4 pb-2">
            <RowActions i={i} onChanged={q.reload} onError={setErr} onMsg={setMsg}
              afterDelete={() => navigate('/items', { state: { msg: t('view.deleted', { name: i.name }) } })} />
          </div>
        </div>
      )}
    </div>
  );
}

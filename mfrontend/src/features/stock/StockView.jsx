import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { stockApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { fmt } from '../../utils/format';
import { currentLocale } from '../../utils/locale';
import { useDocText } from '../../utils/docText';
import { RowActions, Tag, qty } from './StockList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd>{children || '—'}</dd>
  </div>
);

export default function StockView() {
  const { t } = useTranslation('stock');
  const { t: td, status, direction } = useDocText();
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => stockApi.getAdjustment(id), [id]);
  const d = q.data;
  const showCost = can('items.view_cost');
  const heads = ['item', 'action', 'quantity', 'batch', 'expiry', ...(showCost ? ['unitCost'] : []), 'remarks'].map((k) => t(`view.cols.${k}`));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-[18px] font-bold">{d ? d.docNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-[14px]">{d ? <Tag>{status(d.status)}</Tag> : tc('loading')}</p>
        </div>
        <Link to="/stock" state={{ tab: 'adjustments' }} className="text-[14px] hover:underline">{td('backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {d && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.date')}>{d.docDate}</Row>
            <Row label={t('view.warehouse')}>{d.warehouse ? `${d.warehouse.code} — ${d.warehouse.name}` : ''}</Row>
            <Row label={t('view.reference')}>{d.reference}</Row>
            <Row label={t('view.reason')}>{d.reason}</Row>
            <Row label={t('view.createdBy')}>{d.creator?.fullName}</Row>
            <Row label={t('view.created')}>{fmt(d.createdAt)}</Row>
            <Row label={t('view.submitted')}>{d.submittedAt && fmt(d.submittedAt)}</Row>
            <Row label={t('view.decision')}>{d.approval?.decidedAt && `${status(d.status)}, ${fmt(d.approval.decidedAt)}`}</Row>
            <Row label={t('view.decisionNote')}>{d.approval?.decisionNote}</Row>
            <Row label={t('view.posted')}>{d.postedAt && fmt(d.postedAt)}</Row>
          </dl>
          <div className="mt-6">
            <h2 className="mb-2 text-[14px] font-bold">{t('view.items')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white">
                <thead><tr>{heads.map((h, n) => <th key={h} className={`${HEAD} ${al(n)}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {(d.lines || []).map((l) => (
                    <tr key={l.id} className="bg-white">
                      <td className={`${CELL} text-left`}><div>{l.item?.name}</div><div className="text-xs">{l.item?.sku}</div></td>
                      <td className={`${CELL} text-center`}>{direction(l.direction)}</td>
                      <td className={`${CELL} text-center`}>{qty(l.quantity)} {l.item?.unit}</td>
                      <td className={`${CELL} text-center`}>{l.batch?.batchNo || l.batchNo || '—'}</td>
                      <td className={`${CELL} text-center`}>{l.batch?.expiryDate || l.expiryDate || '—'}</td>
                      {showCost && <td className={`${CELL} text-center`}>{l.unitCost != null ? Number(l.unitCost).toLocaleString(currentLocale(), { minimumFractionDigits: 2 }) : '—'}</td>}
                      <td className={`${CELL} text-center`}>{l.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 pb-2">
            <RowActions d={d} onChanged={q.reload} onError={setErr}
              afterDelete={() => navigate('/stock', { state: { tab: 'adjustments', msg: t('view.deleted', { docNo: d.docNo }) } })} />
          </div>
        </div>
      )}
    </div>
  );
}

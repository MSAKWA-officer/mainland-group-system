import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warehouseTransferApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { Tag, qty } from '../stock/StockList.jsx';
import { RowActions } from './WarehouseTransfersList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]"><dt className="font-medium">{label}</dt><dd>{children || '—'}</dd></div>
);

export default function WarehouseTransfersView() {
  const { t } = useTranslation('warehouseTransfers');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => warehouseTransferApi.get(id), [id]);
  const d = q.data;
  const heads = ['item', 'batch', 'quantity', 'remarks'];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div><h1 className="text-[18px] font-bold">{d ? d.transferNo : t('title')}</h1>{!d && <p className="mt-1">{tc('loading')}</p>}</div>
        <Link to="/warehouse-transfers" className="hover:underline">{t('back')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && <div className="px-6 [&>div]:!text-black"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {d && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('cols.status')}><Tag>{t(`status.${d.status}`)}</Tag></Row>
            <Row label={t('cols.from')}>{d.fromWarehouse?.name}</Row>
            <Row label={t('cols.to')}>{d.toWarehouse?.name}</Row>
            <Row label={t('cols.date')}>{d.transferDate}</Row>
            <Row label={t('view.reason')}>{d.reason}</Row>
            <Row label={t('cols.createdBy')}>{d.creator?.fullName}</Row>
            <Row label={t('view.requested')}>{fmt(d.submittedAt)}</Row>
            {d.approval?.decidedAt && <Row label={t('view.decision')}>{fmt(d.approval.decidedAt)}</Row>}
            {d.approval?.decisionNote && <Row label={t('view.decisionNote')}>{d.approval.decisionNote}</Row>}
            {d.completedAt && <Row label={t('view.completed')}>{fmt(d.completedAt)}</Row>}
          </dl>
          <div className="mt-6 overflow-x-auto"><table className="w-full border-collapse bg-white">
            <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`lineCols.${h}`)}</th>)}</tr></thead>
            <tbody>{d.lines.map((l) => (
              <tr key={l.id}>
                <td className={`${CELL} text-left`}><div>{l.item?.name}</div><div className="text-xs">{l.item?.sku}</div></td>
                <td className={`${CELL} text-center`}>{l.batch ? `${l.batch.batchNo} (${l.batch.expiryDate})` : '—'}</td>
                <td className={`${CELL} text-center`}>{qty(l.quantity)} {l.item?.unit}</td>
                <td className={`${CELL} text-center`}>{l.remarks || '—'}</td>
              </tr>))}</tbody>
          </table></div>
          <div className="mt-4 pb-2"><RowActions d={d} onChanged={q.reload} onError={setErr} /></div>
        </div>
      )}
    </div>
  );
}

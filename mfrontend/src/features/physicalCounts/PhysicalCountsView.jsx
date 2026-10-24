import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { physicalCountApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { Tag, qty } from '../stock/StockList.jsx';
import { diff } from './PhysicalCountsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]"><dt className="font-medium">{label}</dt><dd>{children || '—'}</dd></div>
);

export default function PhysicalCountsView() {
  const { t } = useTranslation('physicalCounts');
  const { id } = useParams();
  const { can } = useAuth();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => physicalCountApi.get(id), [id]);
  const d = q.data;
  const voidIt = async () => {
    const reason = window.prompt(t('voidPrompt', { no: d.countNo }));
    if (!reason || reason.trim().length < 3) return;
    setErr('');
    try { await physicalCountApi.voidCount(d.id, reason.trim()); q.reload(); } catch (x) { setErr(errMsg(x)); }
  };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div><h1 className="text-[18px] font-bold">{d ? `${t('viewTitle')} ${d.countNo}` : t('viewTitle')}</h1></div>
        <div className="flex items-center gap-3">
          {d?.status === 'POSTED' && can('physical_counts.void') && <button type="button" className="btn-ghost !text-red-600" onClick={voidIt}>{t('actions.void')}</button>}
          <Link to="/physical-counts" className="hover:underline">{t('back')}</Link>
        </div>
      </div>
      <div className="px-4 [&>div]:!text-black"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      {d && (
        <div className="space-y-5 px-4 pb-6">
          <dl className="max-w-3xl">
            <Row label={t('cols.status')}><Tag>{t(`status.${d.status}`)}</Tag></Row>
            <Row label={t('cols.warehouse')}>{d.warehouse ? `${d.warehouse.code} — ${d.warehouse.name}` : ''}</Row>
            <Row label={t('cols.date')}>{d.countDate}</Row>
            <Row label={t('cols.createdBy')}>{d.creator?.fullName}</Row>
            <Row label={t('form.note')}>{d.note}</Row>
            <Row label={t('cols.itemsCounted')}>{d.itemsCounted}</Row>
            <Row label={t('cols.itemsWithDifference')}>{d.itemsWithDifference}</Row>
            <Row label={t('cols.totalDifference')}>{diff(d.totalDifference)}</Row>
            {d.status === 'VOID' && <Row label={t('voidedBy')}>{`${d.voider?.fullName || '—'}${d.voidedAt ? ` · ${fmt(d.voidedAt)}` : ''} — ${d.voidReason || ''}`}</Row>}
          </dl>
          <p className="max-w-3xl text-xs">{t('bookNote', { date: d.countDate })}</p>
          <div className="overflow-x-auto"><table className="w-full border-collapse bg-white">
            <thead><tr>{['code', 'name', 'unit', 'book', 'counted', 'difference'].map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`lineCols.${h}`)}</th>)}</tr></thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td className={`${CELL} text-left whitespace-nowrap`}>{l.item?.sku}</td>
                  <td className={`${CELL} text-center`}>{l.item?.name}</td>
                  <td className={`${CELL} text-center`}>{l.item?.unit}</td>
                  <td className={`${CELL} text-center`}>{qty(l.bookQty)}</td>
                  <td className={`${CELL} text-center font-semibold`}>{qty(l.countedQty)}</td>
                  <td className={`${CELL} text-center`}>{diff(Number(l.countedQty) - Number(l.bookQty))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

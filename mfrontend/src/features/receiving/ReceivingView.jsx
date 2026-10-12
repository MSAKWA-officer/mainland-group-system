import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { receivingApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { fmt } from '../../utils/format';
import { Tag, qty } from '../stock/StockList.jsx';
import { currentLocale } from '../../utils/locale';
import { useDocText } from '../../utils/docText';
import { RowActions } from './ReceivingList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd>{children || '—'}</dd>
  </div>
);
const money = (v) => Number(v).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReceivingView() {
  const { t } = useTranslation('receiving');
  const { t: tc } = useTranslation('common');
  const docs = useDocText();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => receivingApi.get(id), [id]);
  const d = q.data;
  const showCost = can('items.view_cost');
  const heads = ['item', 'quantity', 'batch', 'expiry', ...(showCost ? ['unitCost', 'lineTotal'] : []), 'remarks'];
  const total = (d?.lines || []).reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost || 0), 0);
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-[18px] font-bold">{d ? d.docNo : t('title')}</h1>
          <p className="mt-1 text-[14px]">{d ? <Tag>{docs.status(d.status)}</Tag> : tc('loading')}</p>
        </div>
        <Link to="/receiving" className="text-[14px] hover:underline">{docs.t('backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {d && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.date')}>{d.docDate}</Row>
            <Row label={t('view.supplier')}>{d.partyName}</Row>
            <Row label={t('view.reference')}>{d.reference}</Row>
            <Row label={t('view.notes')}>{d.reason}</Row>
            <Row label={t('view.createdBy')}>{d.creator?.fullName}</Row>
            <Row label={t('view.created')}>{fmt(d.createdAt)}</Row>
            <Row label={t('view.submitted')}>{d.submittedAt && fmt(d.submittedAt)}</Row>
            <Row label={t('view.decision')}>{d.approval?.decidedAt && `${docs.status(d.status)}, ${fmt(d.approval.decidedAt)}`}</Row>
            <Row label={t('view.decisionNote')}>{d.approval?.decisionNote}</Row>
            <Row label={t('view.posted')}>{d.postedAt && fmt(d.postedAt)}</Row>
          </dl>
          <div className="mt-6">
            <h2 className="mb-2 text-[14px] font-bold">{t('view.itemsReceived')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white">
                <thead><tr>{heads.map((h, n) => <th key={h} className={`${HEAD} ${al(n)}`}>{t(`lineCols.${h}`)}</th>)}</tr></thead>
                <tbody>
                  {(d.lines || []).map((l) => (
                    <tr key={l.id} className="bg-white">
                      <td className={`${CELL} text-left`}><div>{l.item?.name}</div><div className="text-xs">{l.item?.sku}</div></td>
                      <td className={`${CELL} text-center`}>{qty(l.quantity)} {l.item?.unit}</td>
                      <td className={`${CELL} text-center`}>{l.batch?.batchNo || l.batchNo || '—'}</td>
                      <td className={`${CELL} text-center`}>{l.batch?.expiryDate || l.expiryDate || '—'}</td>
                      {showCost && <td className={`${CELL} text-center`}>{l.unitCost != null ? money(l.unitCost) : '—'}</td>}
                      {showCost && <td className={`${CELL} text-center`}>{l.unitCost != null ? money(Number(l.quantity) * Number(l.unitCost)) : '—'}</td>}
                      <td className={`${CELL} text-center`}>{l.remarks || '—'}</td>
                    </tr>
                  ))}
                  {showCost && (
                    <tr><td className={`${CELL} text-left font-semibold`} colSpan={heads.length - 2}>{t('totalCost')}</td><td className={`${CELL} text-center font-semibold`}>{money(total)}</td><td className={`${CELL} text-center`} /></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 pb-2">
            <RowActions d={d} onChanged={q.reload} onError={setErr}
              afterDelete={() => navigate('/receiving', { state: { msg: t('deleted', { docNo: d.docNo }) } })} />
          </div>
        </div>
      )}
    </div>
  );
}

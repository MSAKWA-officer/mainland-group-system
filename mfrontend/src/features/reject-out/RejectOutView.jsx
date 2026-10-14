import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { rejectOutApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { fmt } from '../../utils/format';
import { currentLocale } from '../../utils/locale';
import { useDocText } from '../../utils/docText';
import { Tag, qty } from '../stock/StockList.jsx';
import { RowActions } from './RejectOutList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd>{children || '—'}</dd>
  </div>
);

export default function RejectOutView() {
  const { t } = useTranslation('rejectOut');
  const { status: statusText } = useDocText();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => rejectOutApi.get(id), [id]);
  const d = q.data;
  const heads = ['item', 'quantity', 'batch', 'expiry', 'remarks'].map((k) => t(`view.${k}`));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-[18px] font-bold">{d ? d.docNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-[14px]">{d ? <Tag>{statusText(d.status)}</Tag> : t('loading', { ns: 'common' })}</p>
        </div>
        <Link to="/reject-out" className="text-[14px] hover:underline">{t('view.backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {d && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.dateReturned')}>{d.docDate}</Row>
            <Row label={t('view.party')}>{d.partyName}</Row>
            <Row label={t('view.reference')}>{d.reference}</Row>
            <Row label={t('view.reason')}>{d.reason}</Row>
            <Row label={t('view.createdBy')}>{d.creator?.fullName}</Row>
            <Row label={t('view.created')}>{fmt(d.createdAt)}</Row>
            {d.submittedAt && <Row label={t('view.submitted')}>{fmt(d.submittedAt)}</Row>}
            {d.approval?.decidedAt && <Row label={t('view.decision')}>{t('view.decisionValue', { status: statusText(d.status), date: fmt(d.approval.decidedAt) })}</Row>}
            {d.approval?.decisionNote && <Row label={t('view.decisionNote')}>{d.approval.decisionNote}</Row>}
            <Row label={t('view.postedToStock')}>{d.postedAt && fmt(d.postedAt)}</Row>
          </dl>
          <div className="mt-6">
            <h2 className="mb-2 text-[14px] font-bold">{t('form.itemsReturned')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white">
                <thead><tr>{heads.map((h, n) => <th key={h} className={`${HEAD} ${al(n)}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {(d.lines || []).map((l) => (
                    <tr key={l.id} className="bg-white">
                      <td className={`${CELL} text-left`}><div>{l.item?.name}</div><div className="text-xs">{l.item?.sku}</div></td>
                      <td className={`${CELL} text-center`}>{qty(l.quantity)} {l.item?.unit}</td>
                      <td className={`${CELL} text-center`}>{l.batch?.batchNo || '—'}</td>
                      <td className={`${CELL} text-center`}>{l.batch?.expiryDate || '—'}</td>
                      <td className={`${CELL} text-center`}>{l.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 pb-2">
            <RowActions d={d} onChanged={q.reload} onError={setErr}
              afterDelete={() => navigate('/reject-out', { state: { msg: t('view.deleted', { docNo: d.docNo }) } })} />
          </div>
        </div>
      )}
    </div>
  );
}

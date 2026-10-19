import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { warehouseTransferApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import { Tag, qty } from '../stock/StockList.jsx';
import { RowActions } from './WarehouseTransfersList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] sm:grid-cols-[11rem_1fr]"><dt className="font-medium">{label}</dt><dd>{children || '—'}</dd></div>
);

// The salesperson of the receiving warehouse answers for the goods that were sent: received everything, received less, or received nothing.
// Less / nothing needs a note (the Manager is told and follows it up outside the system). What did not arrive goes back to the sending warehouse.
function ReceivePanel({ d, onDone }) {
  const { t } = useTranslation('warehouseTransfers');
  const [got, setGot] = useState(() => Object.fromEntries(d.lines.map((l) => [l.id, String(l.quantity)])));
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const send = async (outcome) => {
    setErr(''); setFe({});
    if (outcome !== 'FULL' && note.trim().length < 3) { setFe({ note: t('receive.noteRequired') }); return; }
    if (outcome === 'SHORT') {
      const less = d.lines.some((l) => Number(got[l.id]) < Number(l.quantity));
      const bad = d.lines.some((l) => got[l.id] === '' || Number(got[l.id]) < 0 || Number(got[l.id]) > Number(l.quantity));
      if (bad) { setErr(t('receive.badQty')); return; }
      if (!less) { setErr(t('receive.nothingShort')); return; }
    }
    if (!window.confirm(t(`receive.confirm.${outcome}`, { no: d.transferNo }))) return;
    setBusy(true);
    try {
      await warehouseTransferApi.act(d.id, 'receive', { outcome, ...(note.trim() && { note: note.trim() }),
        ...(outcome === 'SHORT' && { lines: d.lines.map((l) => ({ lineId: l.id, receivedQty: Number(got[l.id]) })) }) });
      onDone();
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="mt-6 max-w-3xl rounded-md border border-line p-4">
      <h2 className="text-[16px] font-bold">{t('receive.title')}</h2>
      <p className="mt-1 text-[13px]">{t('receive.hint')}</p>
      <Banner>{err}</Banner>
      {fe.lines && <p className="mt-1 text-xs">{fe.lines}</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse bg-white">
        <thead><tr>{['item', 'quantity', 'received'].map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`lineCols.${h === 'quantity' ? 'sent' : h}`)}</th>)}</tr></thead>
        <tbody>{d.lines.map((l, n) => (
          <tr key={l.id}>
            <td className={`${CELL} text-left`}><div>{l.item?.name}</div><div className="text-xs">{l.batch ? `${l.batch.batchNo} (${l.batch.expiryDate})` : l.item?.sku}</div></td>
            <td className={`${CELL} text-center`}>{qty(l.quantity)} {l.item?.unit}</td>
            <td className={`${CELL} text-center`}>
              <input className="input max-w-[8rem] !text-black" type="number" min="0" max={l.quantity} step="0.001" value={got[l.id]} onChange={(e) => setGot({ ...got, [l.id]: e.target.value })} />
              {fe[`lines.${n}.receivedQty`] && <p className="mt-1 text-xs">{fe[`lines.${n}.receivedQty`]}</p>}
            </td>
          </tr>))}</tbody>
      </table></div>
      <label className="label mt-4 block">{t('receive.note')}</label>
      <textarea className="input !text-black" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('receive.notePlaceholder')} />
      {fe.note && <p className="mt-1 text-xs">{fe.note}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => send('FULL')}>{t('receive.full')}</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => send('SHORT')}>{t('receive.short')}</button>
        <button type="button" className="btn-ghost !text-red-600" disabled={busy} onClick={() => send('NONE')}>{t('receive.none')}</button>
      </div>
    </div>
  );
}

export default function WarehouseTransfersView() {
  const { t } = useTranslation('warehouseTransfers');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const { can } = useAuth();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => warehouseTransferApi.get(id), [id]);
  const d = q.data;
  const showGot = !!d && d.lines.some((l) => l.receivedQty != null);
  const heads = ['item', 'batch', 'quantity', ...(showGot ? ['received'] : []), 'remarks'];
  const problem = d && (d.status === 'RECEIVED_SHORT' || d.status === 'NOT_RECEIVED');
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
            {d.requiresReceipt && <Row label={t('view.needsReceipt')}>{t('view.needsReceiptYes')}</Row>}
            {d.receivedAt && <Row label={t('view.received')}>{fmt(d.receivedAt)}</Row>}
            {d.receiveNote && <Row label={t('view.receiveNote')}>{d.receiveNote}</Row>}
            {d.completedAt && <Row label={t('view.completed')}>{fmt(d.completedAt)}</Row>}
          </dl>
          {problem && <div className="mt-3 max-w-3xl [&>div]:!text-black"><Banner>{t(`view.problem.${d.status}`)}</Banner></div>}
          <div className="mt-6 overflow-x-auto"><table className="w-full border-collapse bg-white">
            <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{t(`lineCols.${h}`)}</th>)}</tr></thead>
            <tbody>{d.lines.map((l) => (
              <tr key={l.id}>
                <td className={`${CELL} text-left`}><div>{l.item?.name}</div><div className="text-xs">{l.item?.sku}</div></td>
                <td className={`${CELL} text-center`}>{l.batch ? `${l.batch.batchNo} (${l.batch.expiryDate})` : '—'}</td>
                <td className={`${CELL} text-center`}>{qty(l.quantity)} {l.item?.unit}</td>
                {showGot && <td className={`${CELL} text-center`}>{l.receivedQty != null ? `${qty(l.receivedQty)} ${l.item?.unit || ''}` : '—'}</td>}
                <td className={`${CELL} text-center`}>{l.remarks || '—'}</td>
              </tr>))}</tbody>
          </table></div>
          {d.status === 'IN_TRANSIT' && can('warehouse_transfers.receive') && <ReceivePanel d={d} onDone={q.reload} />}
          <div className="mt-4 pb-2"><RowActions d={d} hideReceive onChanged={q.reload} onError={setErr} /></div>
        </div>
      )}
    </div>
  );
}

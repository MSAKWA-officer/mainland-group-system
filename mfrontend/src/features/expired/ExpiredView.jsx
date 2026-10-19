import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { stockApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { useDocText } from '../../utils/docText';
import { qty } from '../stock/StockList.jsx';
import { BatchActions, CELL, HEAD, al, TONE, useBatchText } from './ExpiredList.jsx';

const Row = ({ label, children, tone }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className={tone}>{children || '—'}</dd>
  </div>
);

// Small table used for the receiving and write-off history of the batch.
function Table({ title, heads, rows }) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>—</td></tr>}
            {rows.map((r, n) => <tr key={n}>{r.map((c, i) => <td key={i} className={`${CELL} ${al(i)}`}>{c || '—'}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One batch: the list columns plus all the remaining details (SKU, supplier, document, reference, who received it, write-offs).
export default function ExpiredView() {
  const { t, status: statusText } = useBatchText();
  const doc = useDocText();
  const { id } = useParams();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => stockApi.expiryBatch(id), [id]);
  const b = q.data;
  const L = (k, d) => t(`batches.cols.${k}`, { defaultValue: d });
  const V = (k, d) => t(`batches.view.${k}`, { defaultValue: d });
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{b ? `${b.item?.name} / ${b.batchNo}` : t('view.fallbackTitle')}</h1>
          <p className={`mt-1 text-sm ${b ? TONE[b.status] : ''}`}>{b ? statusText(b.status) : t('loading', { ns: 'common' })}</p>
        </div>
        <Link to="/expired" className="text-sm hover:underline">{t('view.backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>}
      {b && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={L('batchNo', 'Batch no.')}>{b.batchNo}</Row>
            <Row label={L('item', 'Item')}>{b.item?.name}</Row>
            <Row label={V('sku', 'SKU')}>{b.item?.sku}</Row>
            <Row label={L('warehouse', 'Warehouse')}>{(b.warehouses || []).map((w) => `${w.name} (${w.quantity})`).join(', ')}</Row>
            <Row label={V('barcode', 'Barcode')}>{b.item?.barcode}</Row>
            <Row label={L('dateReceived', 'Date received')}>{b.dateReceived}</Row>
            <Row label={L('quantity', 'Quantity in stock')}>{`${qty(b.quantity)} ${b.item?.unit || ''}`}</Row>
            <Row label={L('expiryDate', 'Expiry date')}>{b.expiryDate}</Row>
            <Row label={V('daysToExpiry', 'Days to expiry')} tone={TONE[b.status]}>
              {b.daysToExpiry < 0 ? t('batches.view.daysAgo', { n: -b.daysToExpiry, defaultValue: 'Expired {{n}} day(s) ago' }) : String(b.daysToExpiry)}
            </Row>
            <Row label={L('status', 'Status')} tone={TONE[b.status]}>{statusText(b.status)}</Row>
            <Row label={V('created', 'Batch created')}>{fmt(b.createdAt)}</Row>
            <Row label={V('updated', 'Last stock change')}>{fmt(b.updatedAt)}</Row>
          </dl>
          <Table title={V('receivedVia', 'Received through')}
            heads={[V('docNo', 'Document no.'), V('date', 'Date'), V('supplier', 'Supplier'), V('reference', 'Reference'), V('notes', 'Notes'), V('qtyReceived', 'Quantity received'), V('receivedBy', 'Received by')]}
            rows={b.receipts.map((r) => [r.docNo, r.docDate, r.partyName, r.reference, r.notes, qty(r.quantity), r.receivedBy])} />
          <Table title={V('writeOffs', 'Expired write-offs')}
            heads={[V('docNo', 'Document no.'), V('date', 'Date'), V('reference', 'Reference'), V('notes', 'Notes'), V('qtyWrittenOff', 'Quantity written off'), V('createdBy', 'Created by'), L('status', 'Status')]}
            rows={b.writeOffs.map((w) => [w.docNo, w.docDate, w.reference, w.notes, qty(w.quantity), w.createdBy, doc.status(w.status)])} />
          <div className="mt-4 pb-2">
            <BatchActions b={b} onChanged={q.reload} onError={setErr} afterDelete={q.reload} />
          </div>
        </div>
      )}
    </div>
  );
}

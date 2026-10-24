import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { itemApi, stockApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import WarehouseField from '../../components/WarehouseField.jsx';
import useLoad from '../../utils/useLoad';
import { useDocText } from '../../utils/docText';
import { LineEditor, buildPayload, emptyLine, today } from './StockCreate.jsx';

// Only a DRAFT can be edited, and only by the person who created it (the API enforces both).
export default function StockUpdate() {
  const { t } = useTranslation('stock');
  const { t: tc } = useTranslation('common');
  const { status } = useDocText();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const doc = useLoad(() => stockApi.getAdjustment(id), [id]);
  const [head, setHead] = useState({ docDate: today(), warehouseId: '', reference: '', reason: '' });
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = doc.data;
  useEffect(() => {
    if (!d) return;
    setHead({ docDate: d.docDate, warehouseId: d.warehouseId || '', reference: d.reference || '', reason: d.reason || '' });
    setLines((d.lines || []).map((l) => ({
      itemId: l.itemId, direction: l.direction, quantity: String(l.quantity), unitCost: l.unitCost ?? '',
      batchNo: l.batchNo || '', expiryDate: l.expiryDate || '', batchId: l.batchId || '', remarks: l.remarks || '',
    })));
  }, [d]);
  const editable = d && d.status === 'DRAFT' && d.createdBy === user.id;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!lines.length) { setErr(t('stock:lines.noItems')); return; }
    setBusy(true);
    try {
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (iid) => { items[iid] = d.lines.find((l) => l.itemId === iid)?.item || await itemApi.get(iid); }));
      await stockApi.updateAdjustment(id, buildPayload(head, lines, can('items.view_cost'), items));
      navigate(`/stock/${id}`, { state: { msg: t('update.updated') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('update.title')}</h1>
          <p className="mt-1 text-sm">{d ? t('update.subtitle', { docNo: d.docNo }) : tc('loading')}</p>
        </div>
        <Link to={`/stock/${id}`} className="text-sm hover:underline">{t('update.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err || doc.error}</Banner>
        {d && !editable && <Banner>{t('update.notEditable', { status: status(d.status).toLocaleLowerCase() })}</Banner>}
        {editable && (
          <>
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Field label={t('create.date')} error={fe.docDate}><input className="input !text-black" type="date" required value={head.docDate} onChange={(e) => setHead({ ...head, docDate: e.target.value })} /></Field>
              <WarehouseField head={head} setHead={setHead} fe={fe} />
              <Field label={t('create.reference')} error={fe.reference}><input className="input !text-black" maxLength={100} value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label={t('create.reason')} error={fe.reason}><textarea className="input !text-black" rows={3} required minLength={3} maxLength={1000} value={head.reason} onChange={(e) => setHead({ ...head, reason: e.target.value })} /></Field></div>
            </div>
            <div className="max-w-6xl"><LineEditor lines={lines} setLines={setLines} fe={fe} warehouseId={head.warehouseId} /></div>
            <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('update.saveChanges')}</button>
          </>
        )}
      </form>
    </div>
  );
}

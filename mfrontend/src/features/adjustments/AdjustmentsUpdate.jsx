import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adjustmentApi, itemApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { useDocText } from '../../utils/docText';
import { LineEditor, buildPayload, emptyLine, today } from '../stock/StockCreate.jsx';
import { HeadFields } from './AdjustmentsCreate.jsx';

// Only a DRAFT can be edited, and only by the person who created it (the API enforces both).
export default function AdjustmentsUpdate() {
  const { t } = useTranslation('adjustments');
  const { t: tc } = useTranslation('common');
  const docs = useDocText();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const doc = useLoad(() => adjustmentApi.get(id), [id]);
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
      await adjustmentApi.update(id, buildPayload(head, lines, can('items.view_cost'), items));
      navigate(`/adjustments/${id}`, { state: { msg: t('draftUpdated') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('editTitle')}</h1>
          <p className="mt-1 text-sm">{d ? t('editSubtitle', { docNo: d.docNo }) : tc('loading')}</p>
        </div>
        <Link to={`/adjustments/${id}`} className="text-sm hover:underline">{t('back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err || doc.error}</Banner>
        {d && !editable && <Banner>{t('cannotEdit', { status: docs.status(d.status).toLowerCase() })}</Banner>}
        {editable && (
          <>
            <HeadFields head={head} setHead={setHead} fe={fe} />
            <div className="max-w-6xl"><LineEditor lines={lines} setLines={setLines} fe={fe} warehouseId={head.warehouseId} /></div>
            <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('saveChanges')}</button>
          </>
        )}
      </form>
    </div>
  );
}

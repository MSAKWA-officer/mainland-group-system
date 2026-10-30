import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { itemApi, receivingApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { useDocText } from '../../utils/docText';
import { HeadFields, LineEditor, buildPayload, emptyLine, today } from './ReceivingCreate.jsx';
import { CorrectionReason, canCorrectDoc } from '../stock/postedDocs.jsx';

// Only a DRAFT can be edited, and only by the person who created it (the API enforces both).
export default function ReceivingUpdate() {
  const { t } = useTranslation('receiving');
  const { t: tc } = useTranslation('common');
  const docs = useDocText();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const doc = useLoad(() => receivingApi.get(id), [id]);
  const [head, setHead] = useState({ docDate: today(), warehouseId: '', partyName: '', reference: '', reason: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = doc.data;
  useEffect(() => {
    if (!d) return;
    setHead({ docDate: d.docDate, warehouseId: d.warehouseId || '', partyName: d.partyName || '', reference: d.reference || '', reason: d.reason || '' });
    setLines((d.lines || []).map((l) => ({
      itemId: l.itemId, quantity: String(l.quantity), unitCost: l.unitCost ?? '',
      batchNo: l.batchNo || '', expiryDate: l.expiryDate || '', remarks: l.remarks || '',
    })));
  }, [d]);
  const posted = d?.status === 'POSTED';                      // a posted document is corrected: the old one is reversed and the new one posted
  const [changeReason, setChangeReason] = useState('');
  const { t: tcr } = useTranslation('correction');
  const editable = d && ((d.status === 'DRAFT' && d.createdBy === user.id) || canCorrectDoc(d, user, can, 'receiving'));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (iid) => { items[iid] = d.lines.find((l) => l.itemId === iid)?.item || await itemApi.get(iid); }));
      if (posted) {                                           // edit of a POSTED document: reverse the old one and post this corrected one
        if (changeReason.trim().length < 3) { setErr(tcr('reasonRequired')); setBusy(false); return; }
        const nd = await receivingApi.correct(id, { ...buildPayload(head, lines, can('items.view_cost'), items), changeReason: changeReason.trim() });
        navigate(`/receiving/${nd.id}`, { state: { msg: tcr('correctSaved', { docNo: nd.docNo }) } });
        return;
      }
      await receivingApi.update(id, buildPayload(head, lines, can('items.view_cost'), items));
      navigate(`/receiving/${id}`, { state: { msg: t('draftUpdated') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('editTitle')}</h1>
          <p className="mt-1 text-sm">{d ? t('editSubtitle', { docNo: d.docNo }) : tc('loading')}</p>
        </div>
        <Link to={`/receiving/${id}`} className="text-sm hover:underline">{t('back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err || doc.error}</Banner>
        {d && !editable && <Banner>{t('cannotEdit', { status: docs.status(d.status).toLowerCase() })}</Banner>}
        {editable && (
          <>
            <HeadFields head={head} setHead={setHead} fe={fe} />
            <div className="max-w-3xl"><LineEditor lines={lines} setLines={setLines} fe={fe} /></div>
            {posted && <CorrectionReason value={changeReason} onChange={setChangeReason} />}
            <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('saveChanges')}</button>
          </>
        )}
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { itemApi, expiredApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { useDocText } from '../../utils/docText';
import { OutLineEditor, buildOutPayload, emptyOutLine, today } from '../stock/OutLines.jsx';
import { HeadFields } from './ExpiredCreate.jsx';

// Only a DRAFT can be edited, and only by the person who created it (the API enforces both).
export default function ExpiredUpdate() {
  const { t } = useTranslation('expired');
  const { status: statusText } = useDocText();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const doc = useLoad(() => expiredApi.get(id), [id]);
  const [head, setHead] = useState({ docDate: today(), warehouseId: '', partyName: '', reference: '', reason: '' });
  const [lines, setLines] = useState([emptyOutLine()]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = doc.data;
  useEffect(() => {
    if (!d) return;
    setHead({ docDate: d.docDate, warehouseId: d.warehouseId || '', partyName: d.partyName || '', reference: d.reference || '', reason: d.reason || '' });
    setLines((d.lines || []).map((l) => ({ itemId: l.itemId, quantity: String(l.quantity), batchId: l.batchId || '', remarks: l.remarks || '' })));
  }, [d]);
  const editable = d && d.status === 'DRAFT' && d.createdBy === user.id;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (iid) => { items[iid] = d.lines.find((l) => l.itemId === iid)?.item || await itemApi.get(iid); }));
      if (posted) {                                           // edit of a POSTED document: reverse the old one and post this corrected one
        if (changeReason.trim().length < 3) { setErr(tcr('reasonRequired')); setBusy(false); return; }
        const nd = await expiredApi.correct(id, { ...buildOutPayload(head, lines, items, false), changeReason: changeReason.trim() });
        navigate(`/expired/${nd.id}`, { state: { msg: tcr('correctSaved', { docNo: nd.docNo }) } });
        return;
      }
      await expiredApi.update(id, buildOutPayload(head, lines, items, false));
      navigate(`/expired/${id}`, { state: { msg: t('edit.draftUpdated') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('edit.title')}</h1>
          <p className="mt-1 text-sm">{t('edit.subtitle', { doc: d ? d.docNo : t('loading', { ns: 'common' }) })}</p>
        </div>
        <Link to={`/expired/${id}`} className="text-sm hover:underline">{t('edit.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err || doc.error}</Banner>
        {d && !editable && <Banner>{t('edit.notEditable', { status: statusText(d.status).toLowerCase() })}</Banner>}
        {editable && (
          <>
            <HeadFields head={head} setHead={setHead} fe={fe} />
            <div className="max-w-3xl"><OutLineEditor lines={lines} setLines={setLines} fe={fe} warehouseId={head.warehouseId} title={t('form.items')} qtyLabel={t('form.qty')} expiryOnly={true} /></div>
            {posted && <CorrectionReason value={changeReason} onChange={setChangeReason} />}
            <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('edit.saveChanges')}</button>
          </>
        )}
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adjustmentApi, itemApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import WarehouseField from '../../components/WarehouseField.jsx';
import { useDocText } from '../../utils/docText';
import { LineEditor, buildPayload, emptyLine, today } from '../stock/StockCreate.jsx';

// The header fields are shared with AdjustmentsUpdate.
export function HeadFields({ head, setHead, fe }) {
  const { t } = useTranslation('adjustments');
  const set = (k) => (e) => setHead({ ...head, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.date')} error={fe.docDate}><input className="input !text-black" type="date" required value={head.docDate} onChange={set('docDate')} /></Field>
      <WarehouseField head={head} setHead={setHead} fe={fe} />
      <Field label={t('form.reference')} error={fe.reference}><input className="input !text-black" maxLength={100} value={head.reference} onChange={set('reference')} /></Field>
      <div className="sm:col-span-2"><Field label={t('form.reason')} error={fe.reason}><textarea className="input !text-black" rows={3} required minLength={3} maxLength={1000} value={head.reason} onChange={set('reason')} /></Field></div>
    </div>
  );
}

export default function AdjustmentsCreate() {
  const { t } = useTranslation('adjustments');
  const docs = useDocText();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [head, setHead] = useState({ docDate: today(), warehouseId: '', reference: '', reason: '' });
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!lines.length) { setErr(t('stock:lines.noItems')); return; }
    setBusy(true);
    try {
      // Look up each chosen item so batch fields are sent for items that track expiry.
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (id) => { items[id] = await itemApi.get(id); }));
      const d = await adjustmentApi.create(buildPayload(head, lines, can('items.view_cost'), items));
      navigate('/adjustments', { state: { msg: t('draftSaved', { docNo: d.docNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('newTitle')}</h1>
          <p className="mt-1 text-sm">{t('newSubtitle')}</p>
        </div>
        <Link to="/adjustments" className="text-sm hover:underline">{docs.t('backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err}</Banner>
        <HeadFields head={head} setHead={setHead} fe={fe} />
        <div className="max-w-6xl"><LineEditor lines={lines} setLines={setLines} fe={fe} warehouseId={head.warehouseId} initialItemId={params.get('itemId') || ''} /></div>
        <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('saveDraft')}</button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { itemApi, damagedApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { OutLineEditor, buildOutPayload, emptyOutLine, today } from '../stock/OutLines.jsx';

// The header fields are shared with DamagedUpdate.
export function HeadFields({ head, setHead, fe }) {
  const { t } = useTranslation('damaged');
  const set = (k) => (e) => setHead({ ...head, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.date')} error={fe.docDate}><input className="input !text-black" type="date" required value={head.docDate} onChange={set('docDate')} /></Field>
      <div className=""><Field label={t('form.reference')} error={fe.reference}><input className="input !text-black" maxLength={100} value={head.reference} onChange={set('reference')} /></Field></div>
      <div className="sm:col-span-2"><Field label={t('form.reason')} error={fe.reason}><textarea className="input !text-black" rows={3} required minLength={3} maxLength={1000} value={head.reason} onChange={set('reason')} /></Field></div>
    </div>
  );
}

export default function DamagedCreate() {
  const { t } = useTranslation('damaged');
  const navigate = useNavigate();
  const [head, setHead] = useState({ docDate: today(), partyName: '', reference: '', reason: '' });
  const [lines, setLines] = useState([emptyOutLine()]);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      // Look up each chosen item so a batch is sent for items that track expiry.
      const items = {};
      await Promise.all([...new Set(lines.map((l) => l.itemId))].map(async (id) => { items[id] = await itemApi.get(id); }));
      const d = await damagedApi.create(buildOutPayload(head, lines, items, false));
      navigate('/damaged', { state: { msg: t('create.draftSaved', { docNo: d.docNo }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/damaged" className="text-sm hover:underline">{t('view.backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-6 border-t border-line px-6 py-6">
        <Banner>{err}</Banner>
        <HeadFields head={head} setHead={setHead} fe={fe} />
        <div className="max-w-3xl"><OutLineEditor lines={lines} setLines={setLines} fe={fe} title={t('form.items')} qtyLabel={t('form.qty')} expiryOnly={false} /></div>
        <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('create.saveDraft')}</button>
      </form>
    </div>
  );
}

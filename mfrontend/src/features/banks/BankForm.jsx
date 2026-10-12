import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { bankApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE } from './BanksList.jsx';

const EMPTY = { name: '', shortName: '', swiftCode: '', country: 'TZ', phone: '', website: '', notes: '' };
const toBody = (f) => ({
  name: f.name.trim(), shortName: f.shortName.trim() || null, swiftCode: f.swiftCode.trim() || null, country: f.country.trim() || 'TZ',
  phone: f.phone.trim() || null, website: f.website.trim() || null, notes: f.notes.trim() || null,
});

// One page for both "New bank" (/banks/new) and "Edit bank" (/banks/:id/edit).
export default function BankForm() {
  const { t } = useTranslation('banks');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const cur = useLoad(() => (editing ? bankApi.get(id) : Promise.resolve(null)), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = cur.data;
  useEffect(() => {
    if (d) setF({ name: d.name, shortName: d.shortName || '', swiftCode: d.swiftCode || '', country: d.country || 'TZ', phone: d.phone || '', website: d.website || '', notes: d.notes || '' });
  }, [d]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      if (editing) { await bankApi.update(id, toBody(f)); navigate(`/banks/${id}`, { state: { msg: t('form.updated') } }); }
      else { await bankApi.create(toBody(f)); navigate('/banks', { state: { msg: t('form.created') } }); }
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{editing ? t('form.editTitle') : t('form.newTitle')}</h1>
          <p className="mt-1 text-sm">{editing ? (d ? `${d.code} · ${d.name}` : tc('loading')) : t('form.newSub')}</p>
        </div>
        <Link to={editing ? `/banks/${id}` : '/banks'} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{editing ? t('form.back') : t('form.backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || cur.error}</Banner></div>
        {(!editing || d) && (<>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label={t('form.name')} error={fe.name}><input className="input" required minLength={2} maxLength={120} placeholder={t('form.namePlaceholder')} value={f.name} onChange={set('name')} /></Field></div>
            <Field label={t('form.shortName')} error={fe.shortName}><input className="input" maxLength={30} placeholder={t('form.shortNamePlaceholder')} value={f.shortName} onChange={set('shortName')} /></Field>
            <Field label={t('form.swift')} error={fe.swiftCode}><input className="input uppercase" maxLength={11} pattern="[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?" title={t('form.swiftTitle')} value={f.swiftCode} onChange={set('swiftCode')} /></Field>
            <Field label={t('form.country')} error={fe.country}><input className="input uppercase" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" title={t('form.countryTitle')} value={f.country} onChange={set('country')} /></Field>
            <Field label={t('form.phone')} error={fe.phone}><input className="input" maxLength={30} pattern="[0-9+()\s\-]{6,30}" title={t('form.phoneTitle')} value={f.phone} onChange={set('phone')} /></Field>
            <div className="sm:col-span-2"><Field label={t('form.website')} error={fe.website}><input className="input" maxLength={150} placeholder="www.example.co.tz" value={f.website} onChange={set('website')} /></Field></div>
            <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={255} value={f.notes} onChange={set('notes')} /></Field></div>
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : editing ? t('form.saveChanges') : t('form.saveNew')}</button>
        </>)}
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, fieldErrs, staffApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';

const EMPTY = { fullName: '', phone: '', email: '', position: '', address: '' };

// The one form behind StaffCreate (no id) and StaffUpdate (id). No login is created here.
export default function StaffForm({ id }) {
  const { t } = useTranslation('staff');
  const editing = !!id;
  const navigate = useNavigate();
  const item = useLoad(() => (editing ? staffApi.get(id) : Promise.resolve(null)), [id]);
  const [f, setF] = useState(EMPTY);
  const [fe, setFe] = useState({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const s = item.data;
  useEffect(() => { if (s) setF({ fullName: s.fullName, phone: s.phone || '', email: s.email || '', position: s.position || '', address: s.address || '' }); }, [s]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    const body = { fullName: f.fullName.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, position: f.position.trim() || null, address: f.address.trim() || null };
    try {
      if (editing) await staffApi.update(id, body); else await staffApi.create(body);
      navigate('/staff', { state: { msg: editing ? t('msg.updated') : t('msg.added') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{editing ? t('form.editTitle') : t('form.addTitle')}</h1>
          <p className="mt-1 text-sm">{editing ? (s ? `${s.code} · ${s.fullName}` : '…') : t('form.addSub')}</p>
        </div>
        <Link to={editing ? `/staff/${id}` : '/staff'} className="inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeftIcon />{t('form.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <Banner>{err || item.error}</Banner>
        {(!editing || s) && (
          <>
            {s?.hasAccount && <Banner kind="ok">{t('form.accountNote')}</Banner>}
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Field label={t('form.fullName')} error={fe.fullName}><input className="input !text-black" required minLength={2} maxLength={100} value={f.fullName} onChange={set('fullName')} /></Field>
              <Field label={t('form.positionOpt')} error={fe.position}><input className="input !text-black" maxLength={80} placeholder={t('form.positionPh')} value={f.position} onChange={set('position')} /></Field>
              <Field label={t('form.phone')} error={fe.phone}><input className="input !text-black" type="tel" maxLength={30} placeholder={t('form.phonePh')} value={f.phone} onChange={set('phone')} /></Field>
              <Field label={t('form.emailOpt')} error={fe.email}><input className="input !text-black" type="email" maxLength={150} value={f.email} onChange={set('email')} /></Field>
              <div className="sm:col-span-2"><Field label={t('form.addressOpt')} error={fe.address}><input className="input !text-black" maxLength={255} value={f.address} onChange={set('address')} /></Field></div>
            </div>
            <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : editing ? t('form.saveChanges') : t('form.save')}</button>
          </>
        )}
      </form>
    </div>
  );
}

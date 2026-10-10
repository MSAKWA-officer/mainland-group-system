import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { approvalApi, errMsg } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import useLoad from '../../utils/useLoad';
import { useApprovalText } from './ApprovalsList.jsx';

export default function ApprovalsCreate() {
  const { t, type: typeName } = useApprovalText();
  const navigate = useNavigate();
  const types = useLoad(() => approvalApi.types(), []);
  const [f, setF] = useState({ type: '', note: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await approvalApi.create({ type: f.type || types.data[0].type, payload: { note: f.note } });
      navigate('/approvals', { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/approvals" className="text-sm text-blue-600 hover:underline">{t('create.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6">
        <Banner>{err || types.error}</Banner>
        <div className="max-w-xl space-y-4">
          <Field label={t('form.requestType')}>
            <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {(types.data || []).map((ty) => <option key={ty.type} value={ty.type}>{typeName(ty.type, ty.label)}</option>)}
            </select>
          </Field>
          <Field label={t('form.note')}><textarea className="input" rows={4} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <button className="btn-primary" disabled={busy || !types.data?.length}>{busy ? t('form.saving') : t('create.saveDraft')}</button>
        </div>
      </form>
    </div>
  );
}

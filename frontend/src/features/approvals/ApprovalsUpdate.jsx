import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { approvalApi, errMsg } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import useLoad from '../../utils/useLoad';
import { useApprovalText } from './ApprovalsList.jsx';

// Only a DRAFT can be edited (the API enforces this too).
export default function ApprovalsUpdate() {
  const { t, type: typeName, status: statusName } = useApprovalText();
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLoad(() => approvalApi.get(id), [id]);
  const types = useLoad(() => approvalApi.types(), []);
  const [f, setF] = useState({ type: '', note: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const a = item.data;
  useEffect(() => { if (a) setF({ type: a.type, note: a.payload?.note || '' }); }, [a]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await approvalApi.update(id, { type: f.type, payload: { ...a.payload, note: f.note } });
      navigate(`/approvals/${id}`, { state: { msg: t('edit.updated') } });
    } catch (x) { setErr(errMsg(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('edit.title')}</h1>
          <p className="mt-1 text-sm">{t('edit.subtitle')}</p>
        </div>
        <Link to={`/approvals/${id}`} className="text-sm text-blue-600 hover:underline">{t('edit.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6">
        <Banner>{err || item.error || types.error}</Banner>
        {a && a.status !== 'DRAFT' && <Banner>{t('edit.locked', { status: statusName(a.status) })}</Banner>}
        {a && (
          <div className="max-w-xl space-y-4">
            <Field label={t('form.requestType')}>
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {(types.data || []).map((ty) => <option key={ty.type} value={ty.type}>{typeName(ty.type, ty.label)}</option>)}
              </select>
            </Field>
            <Field label={t('form.note')}><textarea className="input" rows={4} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <button className="btn-primary" disabled={busy || a.status !== 'DRAFT'}>{busy ? t('form.saving') : t('edit.saveChanges')}</button>
          </div>
        )}
      </form>
    </div>
  );
}

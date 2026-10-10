import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { categoryApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE } from './CategoriesList.jsx';

export default function CategoriesUpdate() {
  const { t } = useTranslation('categories');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLoad(() => categoryApi.get(id), [id]);
  const parents = useLoad(() => categoryApi.list({ isActive: 'true', limit: 500 }), []);
  const [f, setF] = useState({ name: '', description: '', parentId: '', isActive: 'true' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const c = item.data;
  useEffect(() => { if (c) setF({ name: c.name, description: c.description || '', parentId: c.parentId || '', isActive: String(c.isActive) }); }, [c]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      await categoryApi.update(id, { name: f.name.trim(), description: f.description.trim() || null, parentId: f.parentId || null, isActive: f.isActive === 'true' });
      navigate(`/categories/${id}`, { state: { msg: t('edit.done') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('edit.title')}</h1>
          <p className="mt-1 text-sm">{c ? c.name : tc('loading')}</p>
        </div>
        <Link to={`/categories/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error || parents.error}</Banner></div>
        {c && (
          <div className="max-w-xl space-y-4">
            <Field label={t('form.name')} error={fe.name}><input className="input" required minLength={2} maxLength={80} value={f.name} onChange={set('name')} /></Field>
            <Field label={t('form.parent')} error={fe.parentId}>
              <select className="input" value={f.parentId} onChange={set('parentId')}>
                <option value="">{t('form.noParent')}</option>
                {(parents.data?.data || []).filter((p) => p.id !== c.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label={t('form.description')} error={fe.description}><textarea className="input" rows={3} maxLength={255} value={f.description} onChange={set('description')} /></Field>
            <Field label={t('form.status')} error={fe.isActive}>
              <select className="input" value={f.isActive} onChange={set('isActive')}><option value="true">{tc('active')}</option><option value="false">{tc('inactive')}</option></select>
            </Field>
            <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : t('edit.save')}</button>
          </div>
        )}
      </form>
    </div>
  );
}

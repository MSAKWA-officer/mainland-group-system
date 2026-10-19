import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { warehouseApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';

const EMPTY = { name: '', location: '', description: '', storekeeperIds: [], isDefault: false };

// One page for "New warehouse" (/warehouses/new) and "Edit warehouse" (/warehouses/:id/edit).
// The storekeepers chosen here are the only (non-manager) users who can receive stock into this warehouse or send stock out of it.
export default function WarehouseForm() {
  const { t } = useTranslation('warehouses');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { can } = useAuth();
  const canAssign = can('warehouses.assign');
  const cur = useLoad(() => (editing ? warehouseApi.get(id) : Promise.resolve(null)), [id]);
  const keepers = useLoad(() => (canAssign ? warehouseApi.storekeepers() : Promise.resolve([])), [canAssign]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = cur.data;
  useEffect(() => { if (d) setF({ name: d.name, location: d.location || '', description: d.description || '', storekeeperIds: d.storekeepers.map((k) => k.id), isDefault: d.isDefault }); }, [d]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (uid) => setF({ ...f, storekeeperIds: f.storekeeperIds.includes(uid) ? f.storekeeperIds.filter((x) => x !== uid) : [...f.storekeeperIds, uid] });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    const body = { name: f.name.trim(), location: f.location.trim() || null, description: f.description.trim() || null,
      ...(canAssign && { storekeeperIds: f.storekeeperIds }), ...(editing && f.isDefault && !d.isDefault && { isDefault: true }) };
    try {
      if (editing) { await warehouseApi.update(id, body); navigate(`/warehouses/${id}`, { state: { msg: t('form.updated') } }); }
      else { await warehouseApi.create(body); navigate('/warehouses', { state: { msg: t('form.created') } }); }
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{editing ? t('form.editTitle') : t('form.newTitle')}</h1>
          <p className="mt-1 text-sm">{editing ? (d ? `${d.code} · ${d.name}` : tc('loading')) : t('form.newSub')}</p>
        </div>
        <Link to={editing ? `/warehouses/${id}` : '/warehouses'} className="inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeftIcon />{t('form.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className="[&>div]:!text-black"><Banner>{err || cur.error || keepers.error}</Banner></div>
        {(!editing || d) && (<>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label={t('form.name')} error={fe.name}><input className="input" required minLength={2} maxLength={100} value={f.name} onChange={set('name')} /></Field>
            <Field label={t('form.location')} error={fe.location}><input className="input" maxLength={255} value={f.location} onChange={set('location')} /></Field>
            <div className="sm:col-span-2"><Field label={t('form.description')} error={fe.description}><input className="input" maxLength={255} value={f.description} onChange={set('description')} /></Field></div>
            {canAssign && (
              <div className="sm:col-span-2">
                <Field label={t('form.storekeepers')} error={fe.storekeeperIds}>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-line p-3">
                    {(keepers.data || []).length === 0 && <p className="text-sm">{t('form.noStorekeepers')}</p>}
                    {(keepers.data || []).map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={f.storekeeperIds.includes(u.id)} onChange={() => toggle(u.id)} />{u.fullName} ({u.username})
                      </label>
                    ))}
                  </div>
                </Field>
                <p className="mt-1 text-xs">{t('form.storekeepersHint')}</p>
              </div>
            )}
            {editing && d && !d.isDefault && d.isActive && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.isDefault} onChange={(e) => setF({ ...f, isDefault: e.target.checked })} />{t('form.makeDefault')}</label>
            )}
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : editing ? t('form.saveChanges') : t('form.save')}</button>
        </>)}
      </form>
    </div>
  );
}

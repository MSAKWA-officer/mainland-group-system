import { useTranslation } from 'react-i18next';

// The permission check-boxes of the selected role, grouped by module. It has no border of its own: it sits inside the page's single panel.
export default function PermissionEditor({ role, permissions, ids, setIds, editable, onSave, busy }) {
  const { t } = useTranslation('roles');
  const grouped = (permissions || []).reduce((a, p) => ((a[p.module] ||= []).push(p), a), {});
  const toggle = (id) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const label = (code) => { const a = code.split('.')[1]; return t(`actions.${a}`, { defaultValue: a.replace(/_/g, ' ') }); };
  return (
    <div className="text-[14px] text-[#212121]">
      {role && <>
        <div className="mb-1 text-[16px] font-bold">{t(`roles.${role.code}.name`, { defaultValue: role.name })}</div>
        <div className="mb-1 text-[14px]">{t(`roles.${role.code}.description`, { defaultValue: role.description })}</div>
        <p className="mb-4 text-xs">{role.code === 'OWNER' ? t('ownerFixed') : !editable ? t('readOnly') : t('selected', { selected: ids.length, total: (permissions || []).length })}</p>
        <div className="grid gap-5 sm:grid-cols-2">{Object.entries(grouped).map(([mod, list]) => (
          <fieldset key={mod}><legend className="mb-1 font-bold">{t(`modules.${mod}`, { defaultValue: mod.replace(/_/g, ' ') })}</legend>
            {list.map((p) => (
              <label key={p.id} className="flex items-center gap-2 py-0.5 text-[14px]">
                <input type="checkbox" className="accent-brand" disabled={!editable} checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />{label(p.code)}
              </label>
            ))}
          </fieldset>
        ))}</div>
        {editable && <button type="button" className="btn-primary mt-5 text-[14px] font-bold" disabled={busy} onClick={onSave}>{busy ? t('saving') : t('save')}</button>}
      </>}
    </div>
  );
}

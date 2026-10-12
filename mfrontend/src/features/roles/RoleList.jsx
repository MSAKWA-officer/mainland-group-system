import { useTranslation } from 'react-i18next';

// The list of roles on the left of the Roles & permissions panel. It has no border of its own: it sits inside the page's single panel.
export default function RoleList({ roles, selectedId, onSelect }) {
  const { t } = useTranslation('roles');
  return (
    <nav aria-label={t('rolesLabel')} className="space-y-1 text-[14px] text-[#212121]">
      {(roles || []).map((r) => (
        <button key={r.id} type="button" onClick={() => onSelect(r)} aria-current={selectedId === r.id ? 'true' : undefined}
          className={`block w-full rounded-md px-3 py-2 text-left text-[14px] ${selectedId === r.id ? 'bg-ink text-white' : 'hover:bg-mist'}`}>
          <div className="font-semibold">{t(`roles.${r.code}.name`, { defaultValue: r.name })}</div>
          <div className="text-xs opacity-70">{t('permissionsCount', { count: r.permissionIds.length })}</div>
        </button>
      ))}
    </nav>
  );
}

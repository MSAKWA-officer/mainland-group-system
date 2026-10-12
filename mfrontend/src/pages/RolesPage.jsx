import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { roleApi, errMsg } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import Banner from '../components/Banner.jsx';
import RoleList from '../features/roles/RoleList.jsx';
import PermissionEditor from '../features/roles/PermissionEditor.jsx';
import useLoad from '../utils/useLoad';

// The whole Roles & permissions screen in ONE panel: heading, messages, role list and permission editor all sit inside the same div.
export default function RolesPage() {
  const { t } = useTranslation('roles');
  const { can } = useAuth();
  const roles = useLoad(() => roleApi.listRoles(), []);
  const perms = useLoad(() => roleApi.listPermissions(), []);
  const [sel, setSel] = useState(null); const [ids, setIds] = useState([]);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const role = roles.data?.find((r) => r.id === sel) || roles.data?.[0];
  useEffect(() => { if (role) { setSel(role.id); setIds(role.permissionIds); } }, [role?.id, roles.data]); // eslint-disable-line
  const editable = can('roles.manage') && role && role.code !== 'OWNER';
  const save = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try { await roleApi.setPermissions(role.id, ids); setMsg(t('saved', { name: t(`roles.${role.code}.name`, { defaultValue: role.name }) })); roles.reload(); }
    catch (x) { setErr(errMsg(x)); }
    setBusy(false);
  };
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <div className="px-4"><Banner>{err || roles.error || perms.error}</Banner><Banner kind="ok">{msg}</Banner></div>
      <div className="grid gap-6 px-4 pb-4 lg:grid-cols-[14rem_1fr]">
        <RoleList roles={roles.data} selectedId={role?.id} onSelect={(r) => { setSel(r.id); setIds(r.permissionIds); setMsg(''); }} />
        <div className="lg:border-l lg:border-[#e5e7eb] lg:pl-6">
          {roles.data && roles.data.length === 0 ? <p>{t('empty')}</p> : <PermissionEditor role={role} permissions={perms.data} ids={ids} setIds={setIds} editable={editable} onSave={save} busy={busy} />}
        </div>
      </div>
    </div>
  );
}

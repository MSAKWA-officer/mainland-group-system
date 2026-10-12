import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { driverApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al, ActiveDot, FuelDot, IconBtn, NOTICE, PagerBar, TONES, day } from '../fuel/fuelUi.jsx';

export { NOTICE };

// Icon-only actions: View, Edit, Activate / Deactivate, Delete. Used by this list and by DriversView.
// Buttons are shown by permission; the server enforces every rule (a driver with vehicles or fuel funding history cannot be deleted, only deactivated).
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('drivers');
  const { can } = useAuth();
  const navigate = useNavigate();
  const toggle = async () => {
    let body = { isActive: true };
    if (r.isActive) {
      const reason = window.prompt(t('actions.deactivatePrompt', { name: r.fullName }));
      if (!reason || !reason.trim()) return;
      body = { isActive: false, reason: reason.trim() };
    }
    onError('');
    try { await driverApi.setStatus(r.id, body); onChanged?.(r.isActive ? t('actions.deactivated') : t('actions.activated')); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('actions.deleteConfirm', { name: r.fullName }))) return;
    onError('');
    try { await driverApi.remove(r.id); (afterDelete || onChanged)?.(t('actions.deleted')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/drivers/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('drivers.update') && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/drivers/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('drivers.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('drivers.delete') && <IconBtn label={t('actions.delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// [sort value, key in drivers.json -> list.sort.<key>]
const SORTS = [['fullName:asc', 'nameAsc'], ['fullName:desc', 'nameDesc'], ['code:asc', 'code'], ['licenseExpiry:asc', 'expiryAsc'], ['licenseExpiry:desc', 'expiryDesc']];
const COLS = ['code', 'name', 'phone', 'licenceNo', 'class', 'licenceExpiry', 'vehicles', 'fuelFundings', 'status', 'actions'];

export default function DriversList() {
  const { t } = useTranslation('drivers');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ isActive: '', licenseStatus: '', sort: 'fullName:asc' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const [sortBy, sortDir] = f.sort.split(':');
  const list = useLoad(() => driverApi.list({ page, limit: 25, sortBy, sortDir, ...(q && { search: q }), ...(f.isActive && { isActive: f.isActive }), ...(f.licenseStatus && { licenseStatus: f.licenseStatus }) }), [page, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const filtered = q || f.isActive || f.licenseStatus;
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        {can('drivers.create') && <Link to="/drivers/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.isActive} onChange={setFilter('isActive')}>
          <option value="">{t('list.allStatuses')}</option><option value="true">{t('fuel:status.ACTIVE')}</option><option value="false">{t('fuel:status.INACTIVE')}</option>
        </select>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterLicenceAria')} value={f.licenseStatus} onChange={setFilter('licenseStatus')}>
          <option value="">{t('list.anyLicence')}</option><option value="VALID">{t('list.licenceValid')}</option><option value="EXPIRING_SOON">{t('list.licenceExpiringSoon')}</option><option value="EXPIRED">{t('list.licenceExpired')}</option>
        </select>
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('list.sortAria')} value={f.sort} onChange={setFilter('sort')}>
          {SORTS.map(([v, k]) => <option key={v} value={v}>{t(`list.sort.${k}`)}</option>)}
        </select>
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.code}</td>
                <td className={`${CELL} text-center`}>{r.fullName}{r.staff && <div className="text-xs">{t('list.staff', { code: r.staff.code })}</div>}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.phone || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.licenseNo}</td>
                <td className={`${CELL} text-center`}>{r.licenseClass || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.licenseExpiry)}<div className="text-xs"><FuelDot value={r.licenseStatus} /></div></td>
                <td className={`${CELL} text-center`}>{r.vehicleCount}</td>
                <td className={`${CELL} text-center`}>{r.fundingCount}</td>
                <td className={`${CELL} text-center`}><ActiveDot active={r.isActive} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PagerBar page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

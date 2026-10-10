import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, vehicleApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al, ActiveDot, FUEL_TYPE, IconBtn, NOTICE, OptionSelect, PagerBar, TONES, VEHICLE_TYPE, qty, useAllDrivers } from '../fuel/fuelUi.jsx';

export { NOTICE };

// Icon-only actions: View, Edit, Activate / Deactivate, Delete. Used by this list and by VehiclesView.
// Buttons are shown by permission; the server enforces every rule (a vehicle with fuel funding history cannot be deleted, only deactivated).
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('vehicles');
  const { can } = useAuth();
  const navigate = useNavigate();
  const toggle = async () => {
    let body = { isActive: true };
    if (r.isActive) {
      const reason = window.prompt(t('actions.deactivatePrompt', { name: r.plateNo }));
      if (!reason || !reason.trim()) return;
      body = { isActive: false, reason: reason.trim() };
    }
    onError('');
    try { await vehicleApi.setStatus(r.id, body); onChanged?.(r.isActive ? t('actions.deactivated') : t('actions.activated')); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('actions.deleteConfirm', { name: r.plateNo }))) return;
    onError('');
    try { await vehicleApi.remove(r.id); (afterDelete || onChanged)?.(t('actions.deleted')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/vehicles/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('vehicles.update') && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/vehicles/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('vehicles.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('vehicles.delete') && <IconBtn label={t('actions.delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

// [sort value, key in vehicles.json -> list.sort.<key>]
const SORTS = [['plateNo:asc', 'plateAsc'], ['plateNo:desc', 'plateDesc'], ['code:asc', 'code'], ['make:asc', 'makeAsc']];
const COLS = ['code', 'plateNo', 'makeModel', 'type', 'fuel', 'tank', 'defaultDriver', 'fuelFundings', 'status', 'actions'];
const FILTER_KEYS = ['isActive', 'vehicleType', 'fuelType', 'driverId'];

export default function VehiclesList() {
  const { t } = useTranslation('vehicles');
  const { can } = useAuth();
  const location = useLocation();
  const [sp] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ isActive: '', vehicleType: '', fuelType: '', driverId: sp.get('driverId') || '', sort: 'plateNo:asc' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const drivers = useAllDrivers();
  const [sortBy, sortDir] = f.sort.split(':');
  const list = useLoad(() => vehicleApi.list({ page, limit: 25, sortBy, sortDir, ...(q && { search: q }), ...Object.fromEntries(FILTER_KEYS.filter((k) => f[k]).map((k) => [k, f[k]])) }), [page, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const filtered = q || FILTER_KEYS.some((k) => f[k]);
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        {can('vehicles.create') && <Link to="/vehicles/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.isActive} onChange={setFilter('isActive')}>
          <option value="">{t('list.allStatuses')}</option><option value="true">{t('fuel:status.ACTIVE')}</option><option value="false">{t('fuel:status.INACTIVE')}</option>
        </select>
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterTypeAria')} value={f.vehicleType} onChange={setFilter('vehicleType')}>
          <option value="">{t('list.allTypes')}</option>{Object.entries(VEHICLE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterFuelAria')} value={f.fuelType} onChange={setFilter('fuelType')}>
          <option value="">{t('list.allFuelTypes')}</option>{Object.entries(FUEL_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <OptionSelect label={t('list.filterDriverAria')} all={t('list.allDrivers')} options={drivers.data} value={f.driverId} onChange={setFilter('driverId')} />
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('list.sortAria')} value={f.sort} onChange={setFilter('sort')}>
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
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.plateNo}</td>
                <td className={`${CELL} text-center`}>{r.make}{r.model && ` ${r.model}`}{r.year && <div className="text-xs">{r.year}</div>}</td>
                <td className={`${CELL} text-center`}>{VEHICLE_TYPE[r.vehicleType] || r.vehicleType}</td>
                <td className={`${CELL} text-center`}>{FUEL_TYPE[r.fuelType] || r.fuelType}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.tankCapacityLitres != null ? `${qty(r.tankCapacityLitres)} L` : '—'}</td>
                <td className={`${CELL} text-center`}>{r.driver ? <>{can('drivers.read') ? <Link to={`/drivers/${r.driver.id}`} className="underline">{r.driver.fullName}</Link> : r.driver.fullName}{!r.driver.isActive && <div className="text-xs">{t('list.inactive')}</div>}</> : '—'}</td>
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

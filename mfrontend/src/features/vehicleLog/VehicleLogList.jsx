import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, vehicleLogApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, EyeIcon, FileTextIcon, PencilIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmtNum } from '../../utils/format';
import { FuelDot, IconBtn, NOTICE, TONES, askReason, day, useAllVehicles } from '../fuel/fuelUi.jsx';

// Icon-only actions: View, Edit (own active trips; this is also how an open trip is closed) and Void. Used by this list and by VehicleLogView.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('vehicleLog');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const active = r.status === 'ACTIVE';
  const voidIt = async () => {
    const reason = askReason(t('actions.voidPrompt', { no: r.tripNo }));
    if (!reason) return;
    onError('');
    try { await vehicleLogApi.voidTrip(r.id, reason); onChanged?.(t('actions.voided')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/vehicle-log/${r.id}`)}><EyeIcon /></IconBtn>}
      {active && can('vehicle_log.update') && r.createdBy === user?.id && <IconBtn label={r.endKm == null ? t('actions.close') : t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/vehicle-log/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {active && can('vehicle_log.void') && <IconBtn label={t('actions.void')} tone={TONES.off} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const COLS = ['tripNo', 'date', 'vehicle', 'userName', 'purpose', 'time', 'startKm', 'endKm', 'totalKm', 'status', 'actions'];
const hm = (v) => (v ? String(v).slice(0, 5) : '—');

export default function VehicleLogList() {
  const { t } = useTranslation('vehicleLog');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const vehicles = useAllVehicles();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ vehicleId: '', status: 'ALL', open: '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => vehicleLogApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const filtered = q || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><h1 className="text-[18px] font-bold">{t('title')}</h1><p className="mt-0.5 text-[14px]">{t('subtitle')}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/vehicle-log/sheet" className="btn-ghost gap-2 px-4 py-2 text-[14px] font-bold"><FileTextIcon />{t('sheetBtn')}</Link>
          {can('vehicle_log.create') && <Link to="/vehicle-log/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('new')}</Link>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.search')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('list.allVehicles')} value={f.vehicleId} onChange={setFilter('vehicleId')}><option value="">{t('list.allVehicles')}</option>{(vehicles.data || []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
        <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={t('list.state')} value={f.open} onChange={setFilter('open')}><option value="">{t('list.allTrips')}</option><option value="true">{t('list.openOnly')}</option></select>
        <select className="input max-w-[9rem] !text-[14px] !text-[#212121]" aria-label={t('list.status')} value={f.status} onChange={setFilter('status')}><option value="ALL">{t('list.allStatus')}</option><option value="ACTIVE">{t('list.active')}</option><option value="VOIDED">{t('list.voided')}</option></select>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${i === 0 ? 'text-left' : 'text-center'}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.tripNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.tripDate)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.vehicle?.plateNo}</td>
                <td className={`${CELL} text-center`}>{r.userName}</td>
                <td className={`${CELL} text-center`}>{r.purpose}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{hm(r.timeStart)} – {r.timeEnd ? hm(r.timeEnd) : t('list.open')}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{fmtNum(r.startKm, 1)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.endKm == null ? '—' : fmtNum(r.endKm, 1)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.totalKm == null ? '—' : `${fmtNum(r.totalKm, 1)} km`}</td>
                <td className={`${CELL} text-center`}><FuelDot value={r.status} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span>{tc('records', { total })}{list.data && <> · {t('list.activeKm')}: <b>{fmtNum(list.data.activeKm, 1)} km</b></>}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

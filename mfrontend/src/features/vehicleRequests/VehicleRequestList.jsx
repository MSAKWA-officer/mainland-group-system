import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, vehicleRequestApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, FileTextIcon, KeyIcon, PencilIcon, PlusIcon, XCircleIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { IconBtn, NOTICE, TONES, askReason, day } from '../fuel/fuelUi.jsx';

export const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'KEY_OUT', 'RETURNED', 'VOIDED'];
const DOTS = { PENDING: 'bg-amber-500', APPROVED: 'bg-emerald-600', REJECTED: 'bg-red-500', KEY_OUT: 'bg-blue-500', RETURNED: 'bg-emerald-600', VOIDED: 'bg-red-500' };
export const ReqStatus = ({ value }) => {
  const { t } = useTranslation('vehicleRequests');
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[value] || 'bg-slate-400'}`} />{t(`status.${value}`, { defaultValue: value })}</span>;
};

// Icon-only actions, shared with VehicleRequestView. Key is given out on the View page (it needs a vehicle and driver); taking it back is one click here.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('vehicleRequests');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const mine = r.createdBy === user?.id;
  const canDecide = r.status === 'PENDING' && can('vehicle_requests.approve') && (!mine || user?.role === 'OWNER');   // the Owner is the only one exempt from the own-request rule
  const run = (fn, msg) => async () => { onError(''); try { await fn(); onChanged?.(msg); } catch (x) { onError(errMsg(x)); } };
  const reject = () => { const note = askReason(t('actions.rejectPrompt', { no: r.requestNo })); if (note) run(() => vehicleRequestApi.reject(r.id, note), t('actions.rejected'))(); };
  const voidIt = () => { const reason = askReason(t('actions.voidPrompt', { no: r.requestNo })); if (reason) run(() => vehicleRequestApi.voidRequest(r.id, reason), t('actions.voided'))(); };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/vehicle-requests/${r.id}`)}><EyeIcon /></IconBtn>}
      {r.status === 'PENDING' && mine && can('vehicle_requests.update') && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/vehicle-requests/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {canDecide && <IconBtn label={t('actions.approve')} tone={TONES.on} onClick={run(() => vehicleRequestApi.approve(r.id), t('actions.approved'))}><CheckCircleIcon /></IconBtn>}
      {canDecide && <IconBtn label={t('actions.reject')} tone={TONES.del} onClick={reject}><XCircleIcon /></IconBtn>}
      {r.status === 'APPROVED' && can('vehicle_requests.issue_key') && showView && <IconBtn label={t('actions.issueKey')} tone={TONES.edit} onClick={() => navigate(`/vehicle-requests/${r.id}`)}><KeyIcon /></IconBtn>}
      {r.status === 'KEY_OUT' && can('vehicle_requests.issue_key') && <IconBtn label={t('actions.returnKey')} tone={TONES.on} onClick={run(() => vehicleRequestApi.returnKey(r.id), t('actions.returned'))}><KeyIcon /></IconBtn>}
      {['PENDING', 'APPROVED'].includes(r.status) && can('vehicle_requests.void') && <IconBtn label={t('actions.void')} tone={TONES.off} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const COLS = ['requestNo', 'date', 'userName', 'department', 'purpose', 'vehicle', 'driver', 'status', 'actions'];

export default function VehicleRequestList() {
  const { t } = useTranslation('vehicleRequests');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ status: 'ALL', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => vehicleRequestApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
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
          <Link to="/vehicle-requests/register" className="btn-ghost gap-2 px-4 py-2 text-[14px] font-bold"><FileTextIcon />{t('registerBtn')}</Link>
          {can('vehicle_requests.create') && <Link to="/vehicle-requests/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('new')}</Link>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.search')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.status')} value={f.status} onChange={setFilter('status')}><option value="ALL">{t('status.ALL')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
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
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.requestNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.requestDate)}</td>
                <td className={`${CELL} text-center`}>{r.userName}</td>
                <td className={`${CELL} text-center`}>{r.department}</td>
                <td className={`${CELL} text-center`}>{r.purpose}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.vehicle?.plateNo || '—'}</td>
                <td className={`${CELL} text-center`}>{r.driver?.fullName || '—'}</td>
                <td className={`${CELL} text-center`}><ReqStatus value={r.status} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span>{tc('records', { total })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

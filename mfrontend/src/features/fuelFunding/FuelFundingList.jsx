import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, fuelFundingApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, PencilIcon, PlusIcon, XCircleIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al, FuelDot, IconBtn, METHOD, NOTICE, OptionSelect, PagerBar, Stat, TONES, accountLabel, askReason, day, money, qty, useAllDrivers, useAllVehicles } from '../fuel/fuelUi.jsx';

export { NOTICE };

// Icon-only actions: View, Edit (own PENDING request), Approve, Reject, Void. Used by this list and by FuelFundingView.
// The server enforces every rule (nobody approves their own request, a funding with active usage cannot be voided); the buttons only hide what you cannot do.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('fuelFunding');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const pending = r.status === 'PENDING';
  const mine = r.createdBy === user?.id;
  const canDecide = pending && can('fuel_funding.approve') && (!mine || user?.role === 'OWNER');   // the Owner is the only one exempt from the own-request rule
  const run = (fn, done) => async () => { onError(''); try { await fn(); onChanged?.(done); } catch (x) { onError(errMsg(x)); } };
  const approve = () => {
    const how = r.bankAccount ? t('actions.howBank', { amount: money(r.amount), account: accountLabel(r.bankAccount) }) : t('actions.howDirect');
    if (!window.confirm(t('actions.approveConfirm', { no: r.fundingNo, amount: money(r.amount), how }))) return Promise.resolve();
    return run(() => fuelFundingApi.approve(r.id), t('actions.approved'))();
  };
  const reject = () => {
    const note = askReason(t('actions.rejectPrompt', { no: r.fundingNo }));
    return note ? run(() => fuelFundingApi.reject(r.id, note), t('actions.rejected'))() : Promise.resolve();
  };
  const voidIt = () => {
    const reason = askReason(t('actions.voidPrompt', { no: r.fundingNo }));
    return reason ? run(() => fuelFundingApi.voidFunding(r.id, reason), t('actions.voided'))() : Promise.resolve();
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/fuel-funding/${r.id}`)}><EyeIcon /></IconBtn>}
      {pending && can('fuel_funding.update') && mine && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/fuel-funding/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {canDecide && <IconBtn label={t('actions.approve')} tone={TONES.on} onClick={approve}><CheckCircleIcon /></IconBtn>}
      {canDecide && <IconBtn label={t('actions.reject')} tone={TONES.del} onClick={reject}><XCircleIcon /></IconBtn>}
      {(pending || r.status === 'APPROVED') && can('fuel_funding.void') && <IconBtn label={t('actions.void')} tone={TONES.off} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

const COLS = ['fundingNo', 'date', 'vehicle', 'driver', 'purpose', 'amount', 'litres', 'paidBy', 'status', 'raisedBy', 'actions'];

export default function FuelFundingList() {
  const { t } = useTranslation('fuelFunding');
  const { can } = useAuth();
  const location = useLocation();
  const [sp] = useSearchParams();                               // /fuel-funding?vehicleId=…&driverId=…&status=… opens the list already filtered
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ status: sp.get('status') || 'ALL', method: '', vehicleId: sp.get('vehicleId') || '', driverId: sp.get('driverId') || '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const vehicles = useAllVehicles(); const drivers = useAllDrivers();
  const list = useLoad(() => fuelFundingApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const sum = useLoad(() => fuelFundingApi.summary({ groupBy: 'vehicle', ...(f.from && { from: f.from }), ...(f.to && { to: f.to }) }), [f.from, f.to]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); sum.reload(); };
  const filtered = q || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        {can('fuel_funding.create') && <Link to="/fuel-funding/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
        <Stat label={t('list.stats.approvedFilter')} value={money(list.data?.approvedTotal)} />
        <Stat label={t('list.stats.approvedPeriod')} value={money(sum.data?.total)} />
        <Stat label={t('list.stats.records')} value={total} />
      </div>
      {sum.data?.rows?.length > 0 && (
        <p className="px-4 pb-4 text-[14px]">{t('list.approvedByVehicle')} {sum.data.rows.slice(0, 6).map((v) => `${v.label} ${money(v.total)} (${v.count})`).join(' · ')}{sum.data.rows.length > 6 && ` · ${t('list.andMore', { n: sum.data.rows.length - 6 })}`}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'VOIDED'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterMethodAria')} value={f.method} onChange={setFilter('method')}>
          <option value="">{t('list.anyMethod')}</option>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <OptionSelect label={t('list.filterVehicleAria')} all={t('list.allVehicles')} options={vehicles.data} value={f.vehicleId} onChange={setFilter('vehicleId')} />
        <OptionSelect label={t('list.filterDriverAria')} all={t('list.allDrivers')} options={drivers.data} value={f.driverId} onChange={setFilter('driverId')} />
        <label className="flex items-center gap-2 text-[14px]">{t('list.from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{t('list.to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => {
              const dead = ['VOIDED', 'REJECTED'].includes(r.status);
              return (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} whitespace-nowrap text-left`}>{r.fundingNo}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.fundingDate)}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{r.vehicle?.plateNo}</td>
                  <td className={`${CELL} text-center`}>{r.driver?.fullName}</td>
                  <td className={`${CELL} text-center`}>{r.purpose}</td>
                  <td className={`${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`}>{money(r.amount)}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{r.litres != null ? qty(r.litres, 3) : '—'}</td>
                  <td className={`${CELL} text-center`}>{METHOD[r.method] || r.method}</td>
                  <td className={`${CELL} text-center`}><FuelDot value={r.status} /></td>
                  <td className={`${CELL} text-center`}>{r.creator?.fullName}</td>
                  <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PagerBar page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

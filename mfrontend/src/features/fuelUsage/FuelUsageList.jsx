import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errMsg, fuelUsageApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, EyeIcon, PencilIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmtNum } from '../../utils/format';
import { CELL, HEAD, al, IconBtn, NOTICE, Stat, TONES, askReason, day, money } from '../fuel/fuelUi.jsx';

export { NOTICE };

// Status as black text with a coloured dot, translated (the shared FuelDot has English labels built in).
// Labels come from locales/<lang>/fuelUsage.json (status.<CODE>). Also used by FuelUsageView.
const DOTS = { ACTIVE: 'bg-emerald-600', VOIDED: 'bg-red-500' };
export const UsageStatus = ({ value }) => {
  const { t } = useTranslation('fuelUsage');
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[value] || 'bg-slate-400'}`} />{t(`status.${value}`, { defaultValue: value })}</span>;
};

// Pager with translated labels (the shared PagerBar has English text built in).
const Pager = ({ page, total, limit, set }) => {
  const { t: tc } = useTranslation('common');
  return (
    <div className="flex items-center justify-between px-6 py-3 text-sm text-black">
      <span>{tc('records', { total })}</span>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => set(page - 1)}>{tc('previous')}</button>
        <button className="btn-ghost" disabled={page * limit >= total} onClick={() => set(page + 1)}>{tc('next')}</button>
      </div>
    </div>
  );
};

// Icon-only actions: View, Edit (own ACTIVE record), Void. Used by this list and by FuelUsageView.
// The server enforces every rule (who can edit, who can void); the buttons only hide what you cannot do.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('fuelUsage');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const active = r.status === 'ACTIVE';
  const voidIt = async () => {
    const reason = askReason(t('actions.voidPrompt', { no: r.usageNo }));
    if (!reason) return;
    onError(''); try { await fuelUsageApi.voidUsage(r.id, reason); onChanged?.(t('actions.voided')); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/fuel-usage/${r.id}`)}><EyeIcon /></IconBtn>}
      {active && can('fuel_usage.update') && r.createdBy === user?.id && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/fuel-usage/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {active && can('fuel_usage.void') && <IconBtn label={t('actions.void')} tone={TONES.off} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

const COLS = ['usageNo', 'date', 'vehicle', 'driver', 'litres', 'amount', 'pricePerLitre', 'odometer', 'funding', 'status', 'recordedBy', 'actions'];

export default function FuelUsageList() {
  const { t } = useTranslation('fuelUsage');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ status: 'ALL', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => fuelUsageApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const filtered = q || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle')}</p>
        </div>
        {can('fuel_usage.create') && <Link to="/fuel-usage/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
        <Stat label={t('list.stats.spent')} value={money(list.data?.activeTotal)} />
        <Stat label={t('list.stats.litres')} value={`${fmtNum(list.data?.activeLitres, 3)} L`} />
        <Stat label={t('list.stats.records')} value={total} />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          <option value="ALL">{t('status.ALL')}</option><option value="ACTIVE">{t('status.ACTIVE')}</option><option value="VOIDED">{t('status.VOIDED')}</option>
        </select>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => {
              const dead = r.status === 'VOIDED';
              const num = `${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`;
              return (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} whitespace-nowrap text-left`}>{r.usageNo}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.usageDate)}</td>
                  <td className={`${CELL} text-center`}>{r.vehicle?.plateNo}</td>
                  <td className={`${CELL} text-center`}>{r.driver?.fullName}</td>
                  <td className={num}>{fmtNum(r.litres, 3)}</td>
                  <td className={`${num} !font-semibold`}>{money(r.amount)}</td>
                  <td className={num}>{money(r.pricePerLitre)}</td>
                  <td className={num}>{r.odometerKm != null ? `${fmtNum(r.odometerKm, 1)} km` : '—'}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{can('fuel_balances.read') && r.funding ? <Link to={`/fuel-balances/${r.funding.id}`} className="underline">{r.funding.fundingNo}</Link> : r.funding?.fundingNo}</td>
                  <td className={`${CELL} text-center`}><UsageStatus value={r.status} /></td>
                  <td className={`${CELL} text-center`}>{r.creator?.fullName}</td>
                  <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={changed} onError={setErr} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={limit} set={setPage} />
    </div>
  );
}

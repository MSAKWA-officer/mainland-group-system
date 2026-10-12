import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { fuelBalanceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Pager from '../../components/Pager.jsx';
import { EyeIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { CELL, HEAD, al, IconBtn, NOTICE, OptionSelect, Stat, TONES, day, money, useDriverOptions, useVehicleOptions } from '../fuel/fuelUi.jsx';
import { StateDot, useFuelText } from '../fuel/fuelText.jsx';

const VIEWS = ['funding', 'vehicle', 'driver'];
const STALE_DAYS = 7;   // an unspent balance older than this is shown in red

// How much of each approved fuel funding is still unspent. Calculated live from the funding and its usage: nothing is typed in here.
// Users without fuel_balances.read_all only see balances of the fundings they raised.
export default function FuelBalancesList() {
  const { t } = useTranslation('fuelBalances');
  const ft = useFuelText();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('funding');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ state: 'OPEN', vehicleId: '', driverId: '', from: '', to: '' });
  useEffect(() => { const h = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [search]);
  const vehicles = useVehicleOptions(); const drivers = useDriverOptions();
  const params = { ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) };
  const list = useLoad(() => (view === 'funding' ? fuelBalanceApi.list({ page, limit: 25, ...params }) : Promise.resolve(null)), [view, page, q, f]);
  const sum = useLoad(() => (view === 'funding' ? Promise.resolve(null) : fuelBalanceApi.summary({ groupBy: view, ...params })), [view, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const totals = view === 'funding' ? list.data?.totals : sum.data?.totals;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const filtered = q || f.vehicleId || f.driverId || f.from || f.to || f.state !== 'OPEN';
  const err = list.error || sum.error;
  const heads = ['fundingNo', 'givenOn', 'vehicle', 'driver', 'funded', 'spent', 'balance', 'litresBought', 'state', 'daysUnspent', 'actions'].map((k) => t(`heads.${k}`));
  const groupHeads = [view === 'vehicle' ? 'vehicle' : 'driver', 'fundings', 'withMoneyLeft', 'funded', 'spent', 'balance', 'litresBought'].map((k) => t(`heads.${k}`));
  const input = 'input w-auto !text-[14px] !text-[#212121]';
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('intro')}</p>
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
        <Stat label={t('stats.funded')} value={money(totals?.funded)} />
        <Stat label={t('stats.spent')} value={money(totals?.used)} />
        <Stat label={t('stats.balance')} value={money(totals?.balance)} tone={Number(totals?.balance) > 0 ? 'text-red-600' : ''} />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <div className="flex gap-2" role="tablist" aria-label={t('groupBy')}>
          {VIEWS.map((k) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'btn-primary' : 'btn-ghost'} onClick={() => { setView(k); setPage(1); }}>{t(`views.${k}`)}</button>)}
        </div>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('filters.state')} value={f.state} onChange={setFilter('state')}>
          <option value="OPEN">{t('filters.openOnly')}</option><option value="SETTLED">{t('filters.settled')}</option><option value="ALL">{t('filters.all')}</option>
        </select>
        <OptionSelect label={t('filters.vehicle')} all={t('filters.allVehicles')} options={vehicles.data} value={f.vehicleId} onChange={setFilter('vehicleId')} />
        <OptionSelect label={t('filters.driver')} all={t('filters.allDrivers')} options={drivers.data} value={f.driverId} onChange={setFilter('driverId')} />
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('filters.searchPlaceholder')} aria-label={t('filters.search')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-[14px]">{t('filters.givenFrom')} <input type="date" className={input} value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{t('filters.to')} <input type="date" className={input} value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {err && <div className={`px-4 ${NOTICE}`}><Banner>{err}</Banner></div>}

      {view === 'funding' ? (<>
        <div className="overflow-x-auto px-4">
          <table className="w-full border-collapse bg-white">
            <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
            <tbody>
              {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={heads.length}>{filtered ? t('empty.filtered') : t('empty.none')}</td></tr>}
              {rows.map((r) => {
                const open = Number(r.balance) > 0;
                return (
                  <tr key={r.id} className="bg-white">
                    <td className={`${CELL} whitespace-nowrap text-left`}><Link to={`/fuel-balances/${r.id}`} className="underline">{r.fundingNo}</Link></td>
                    <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.disbursedOn)}</td>
                    <td className={`${CELL} text-center`}>{r.plateNo}</td>
                    <td className={`${CELL} text-center`}>{r.driverName}</td>
                    <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.funded)}</td>
                    <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.used)}</td>
                    <td className={`${CELL} whitespace-nowrap text-center ${open ? '!text-red-600' : ''}`}>{money(r.balance)}</td>
                    <td className={`${CELL} whitespace-nowrap text-center`}>{ft.litres(r.usedLitres)}{r.fundedLitres != null && <div className="text-xs">{t('planned', { litres: ft.litres(r.fundedLitres) })}</div>}</td>
                    <td className={`${CELL} text-center`}><StateDot value={r.state} /></td>
                    <td className={`${CELL} whitespace-nowrap text-center ${open && r.daysOutstanding > STALE_DAYS ? '!font-semibold !text-red-600' : ''}`}>{open ? ft.days(r.daysOutstanding) : '—'}</td>
                    <td className={`${CELL} text-center`}>
                      <div className="flex items-center justify-center gap-2">
                        <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/fuel-balances/${r.id}`)}><EyeIcon /></IconBtn>
                        {can('fuel_usage.create') && open && <IconBtn label={t('actions.recordUsage')} tone={TONES.on} onClick={() => navigate(`/fuel-usage/new?fundingId=${r.id}`)}><PlusIcon /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={total} limit={limit} set={setPage} />
      </>) : (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full border-collapse bg-white">
            <thead><tr>{groupHeads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
            <tbody>
              {!sum.loading && (sum.data?.rows || []).length === 0 && <tr><td className={`${CELL} text-left`} colSpan={7}>{filtered ? t('empty.groupFiltered') : t('empty.groupNone')}</td></tr>}
              {(sum.data?.rows || []).map((r) => (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} text-left`}>{r.label}</td>
                  <td className={`${CELL} text-center`}>{r.fundings}</td>
                  <td className={`${CELL} text-center`}>{r.openFundings}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.funded)}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.used)}</td>
                  <td className={`${CELL} whitespace-nowrap text-center ${Number(r.balance) > 0 ? '!text-red-600' : ''}`}>{money(r.balance)}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{ft.litres(r.usedLitres)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

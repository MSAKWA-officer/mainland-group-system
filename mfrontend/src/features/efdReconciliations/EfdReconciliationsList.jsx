import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { efdDeviceApi, efdReconciliationApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, PlusIcon, RefreshIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { IconBtn, TONES } from '../banking/bankingUi.jsx';
import { NOTICE, STATUS_DOT, Stat, Status, Variance, askReason, day, hasDiff, money } from './reconUi.jsx';

export { NOTICE };

// Icon-only actions: View, Refresh (OPEN), Sign off (OPEN), Void. Used by this list and by EfdReconciliationsView.
// The server enforces every rule (Z report must be verified, nobody signs off a day they started, figures must be fresh); the buttons only hide what you cannot do.
// The View page has its own sign-off panel with an explanation box, so it passes hideReconcile.
export function RowActions({ r, showView, hideReconcile, onChanged, onError }) {
  const { t } = useTranslation('efd');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const open = r.status === 'OPEN';
  const mine = r.createdBy === user?.id;
  const canSign = open && !hideReconcile && can('efd_reconciliations.reconcile') && (!mine || user?.role === 'OWNER') && r.zReport?.status === 'VERIFIED';   // the Owner is the only one exempt from the own rule
  const run = (fn, done) => async () => { onError(''); try { await fn(); onChanged?.(done); } catch (x) { onError(errMsg(x)); } };
  const refresh = run(() => efdReconciliationApi.refresh(r.id), t('recon.actions.refreshed'));
  const sign = () => {
    if (!hasDiff(r)) {
      if (!window.confirm(t('recon.actions.signConfirm', { no: r.reconNo, day: day(r.reconDate) }))) return Promise.resolve();
      return run(() => efdReconciliationApi.reconcile(r.id), t('recon.actions.reconciled'))();
    }
    const why = window.prompt(t('recon.actions.signPrompt', { no: r.reconNo, day: day(r.reconDate) }));
    if (!why || why.trim().length < 10) return Promise.resolve();
    return run(() => efdReconciliationApi.reconcile(r.id, why.trim()), t('recon.actions.reconciled'))();
  };
  const voidIt = () => {
    const reason = askReason(`${t('recon.actions.voidPrompt', { no: r.reconNo })}${r.status === 'RECONCILED' ? t('recon.actions.voidReopen') : ''}`);
    return reason ? run(() => efdReconciliationApi.voidRecon(r.id, reason), t('recon.actions.voided'))() : Promise.resolve();
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('recon.actions.view')} tone={TONES.view} onClick={() => navigate(`/efd-reconciliations/${r.id}`)}><EyeIcon /></IconBtn>}
      {open && can('efd_reconciliations.create') && <IconBtn label={t('recon.actions.refresh')} tone={TONES.edit} onClick={refresh}><RefreshIcon /></IconBtn>}
      {canSign && <IconBtn label={t('recon.actions.signOff')} tone={TONES.on} onClick={sign}><CheckCircleIcon /></IconBtn>}
      {['OPEN', 'RECONCILED'].includes(r.status) && can('efd_reconciliations.void') && <IconBtn label={t('recon.actions.void')} tone={TONES.off} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['reconNo', 'date', 'device', 'zReport', 'zGross', 'systemGross', 'grossDiff', 'vatDiff', 'receiptsDiff', 'noEfd', 'status', 'startedBy', 'actions'];

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

export default function EfdReconciliationsList() {
  const { t } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');      // q = debounced search term
  const [f, setF] = useState({ status: 'ALL', deviceId: '', hasDifference: '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const canFilterDevice = can('efd_devices.read');
  const devs = useLoad(() => (canFilterDevice ? efdDeviceApi.list({ limit: 100 }) : Promise.resolve(null)), [canFilterDevice]);
  const list = useLoad(() => efdReconciliationApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const counts = list.data?.statusCounts || {};
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const filtered = q || f.deviceId || f.from || f.to || f.hasDifference || f.status !== 'ALL';
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('recon.list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('recon.list.subtitle')}</p>
        </div>
        {can('efd_reconciliations.create') && <Link to="/efd-reconciliations/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('recon.list.start')}</Link>}
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
        <Stat label={t('recon.list.open')} value={counts.OPEN || 0} />
        <Stat label={t('recon.list.reconciled')} value={counts.RECONCILED || 0} />
        <Stat label={t('recon.list.voided')} value={counts.VOIDED || 0} />
        <Stat label={t('recon.list.records')} value={total} />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('recon.list.search')} aria-label={t('recon.list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('shared.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          <option value="ALL">{t('shared.allStatuses')}</option>{Object.keys(STATUS_DOT).map((k) => <option key={k} value={k}>{t(`recon.status.${k}`)}</option>)}
        </select>
        <select className="input max-w-[13rem] !text-[14px] !text-[#212121]" aria-label={t('recon.list.filterDiffAria')} value={f.hasDifference} onChange={setFilter('hasDifference')}>
          <option value="">{t('recon.list.anyResult')}</option><option value="true">{t('recon.list.withDiff')}</option><option value="false">{t('recon.list.matching')}</option>
        </select>
        {canFilterDevice && (
          <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('shared.filterDeviceAria')} value={f.deviceId} onChange={setFilter('deviceId')}>
            <option value="">{t('shared.allDevices')}</option>{(devs.data?.data || []).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.serialNo})</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {(err || list.error || msg) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`recon.list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('recon.list.emptyFiltered') : t('recon.list.emptyNone')}</td></tr>}
            {rows.map((r) => {
              const dead = r.status === 'VOIDED';
              const num = `${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`;
              return (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} whitespace-nowrap text-left`}>{r.reconNo}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.reconDate)}</td>
                  <td className={`${CELL} text-center`}>{r.device?.name}<div className="text-xs">{r.device?.serialNo}</div></td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{r.zReport && (can('efd_z_reports.read') ? <Link to={`/efd-z-reports/${r.zReport.id}`} className="text-black underline">{r.zReport.reportNo}</Link> : r.zReport.reportNo)}</td>
                  <td className={num}>{money(r.zGross)}</td>
                  <td className={num}>{money(r.receiptsGross)}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}><Variance v={r.grossVariance} /></td>
                  <td className={`${CELL} whitespace-nowrap text-center`}><Variance v={r.vatVariance} /></td>
                  <td className={`${CELL} whitespace-nowrap text-center`}><Variance v={r.countVariance} count /></td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{Number(r.unreceiptedOrdersCount) > 0 ? <b className="text-red-600">{r.unreceiptedOrdersCount}</b> : 0}</td>
                  <td className={`${CELL} text-center`}><Status status={r.status} /></td>
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

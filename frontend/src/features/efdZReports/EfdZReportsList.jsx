import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { efdDeviceApi, efdZReportApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, CheckCircleIcon, EyeIcon, PencilIcon, PlusIcon, XCircleIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { IconBtn, NOTICE, Stat, TONES, askReason, day, money } from '../banking/bankingUi.jsx';

export { NOTICE, money, day };

// Status code -> dot colour. The label comes from locales/<lang>/efd.json (z.status.<CODE>).
export const STATUS_DOT = { PENDING: 'bg-amber-500', VERIFIED: 'bg-emerald-600', REJECTED: 'bg-red-500', VOIDED: 'bg-slate-400' };

// Status as black text with a coloured dot (same look as the other screens).
export const Status = ({ status }) => {
  const { t } = useTranslation('efd');
  const dot = STATUS_DOT[status] || 'bg-slate-400';
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{t(`z.status.${status}`, { defaultValue: status })}</span>;
};

// Icon-only actions: View, Edit (own PENDING report), Verify, Reject, Void. Used by this list and by EfdZReportsView.
// The server enforces every rule (nobody verifies their own report, a report used by a live reconciliation cannot be voided); the buttons only hide what you cannot do.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('efd');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const pending = r.status === 'PENDING';
  const mine = r.createdBy === user?.id;
  const canDecide = pending && can('efd_z_reports.verify') && (!mine || user?.role === 'OWNER');   // the Owner is the only one exempt from the own-report rule
  const run = (fn, done) => async () => { onError(''); try { await fn(); onChanged?.(done); } catch (x) { onError(errMsg(x)); } };
  const verify = () => {
    if (!window.confirm(t('z.actions.verifyConfirm', { no: r.reportNo, z: r.zNumber, gross: money(r.grossAmount) }))) return Promise.resolve();
    return run(() => efdZReportApi.verify(r.id), t('z.actions.verified'))();
  };
  const reject = () => {
    const note = askReason(t('z.actions.rejectPrompt', { no: r.reportNo }));
    return note ? run(() => efdZReportApi.reject(r.id, note), t('z.actions.rejected'))() : Promise.resolve();
  };
  const voidIt = () => {
    const reason = askReason(t('z.actions.voidPrompt', { no: r.reportNo }));
    return reason ? run(() => efdZReportApi.voidReport(r.id, reason), t('z.actions.voided'))() : Promise.resolve();
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('z.actions.view')} tone={TONES.view} onClick={() => navigate(`/efd-z-reports/${r.id}`)}><EyeIcon /></IconBtn>}
      {pending && can('efd_z_reports.update') && mine && <IconBtn label={t('z.actions.edit')} tone={TONES.edit} onClick={() => navigate(`/efd-z-reports/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {canDecide && <IconBtn label={t('z.actions.verify')} tone={TONES.on} onClick={verify}><CheckCircleIcon /></IconBtn>}
      {canDecide && <IconBtn label={t('z.actions.reject')} tone={TONES.del} onClick={reject}><XCircleIcon /></IconBtn>}
      {(pending || r.status === 'VERIFIED') && can('efd_z_reports.void') && <IconBtn label={t('z.actions.void')} tone={TONES.off} onClick={voidIt}><BanIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['reportNo', 'date', 'device', 'zNumber', 'receipts', 'gross', 'vat', 'net', 'status', 'recordedBy', 'actions'];

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

export default function EfdZReportsList() {
  const { t } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');      // q = debounced search term
  const [f, setF] = useState({ status: 'ALL', deviceId: '', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const canFilterDevice = can('efd_devices.read');
  const devs = useLoad(() => (canFilterDevice ? efdDeviceApi.list({ limit: 100 }) : Promise.resolve(null)), [canFilterDevice]);
  const list = useLoad(() => efdZReportApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const changed = (m) => { setOk(m || ''); list.reload(); };
  const filtered = q || f.deviceId || f.from || f.to || f.status !== 'ALL';
  const msg = ok || location.state?.msg;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('z.list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('z.list.subtitle')}</p>
        </div>
        {can('efd_z_reports.create') && <Link to="/efd-z-reports/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('z.list.record')}</Link>}
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
        <Stat label={t('z.list.verifiedGross')} value={money(list.data?.verifiedGross)} />
        <Stat label={t('z.list.verifiedVat')} value={money(list.data?.verifiedVat)} />
        <Stat label={t('z.list.records')} value={total} />
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('z.list.search')} aria-label={t('z.list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('shared.filterStatusAria')} value={f.status} onChange={setFilter('status')}>
          <option value="ALL">{t('shared.allStatuses')}</option>{Object.keys(STATUS_DOT).map((k) => <option key={k} value={k}>{t(`z.status.${k}`)}</option>)}
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
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`z.list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('z.list.emptyFiltered') : t('z.list.emptyNone')}</td></tr>}
            {rows.map((r) => {
              const dead = ['VOIDED', 'REJECTED'].includes(r.status);
              const amt = `${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`;
              return (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} whitespace-nowrap text-left`}>{r.reportNo}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.reportDate)}</td>
                  <td className={`${CELL} text-center`}>{r.device?.name}<div className="text-xs">{r.device?.serialNo}</div></td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{r.zNumber}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{r.receiptsCount}</td>
                  <td className={`${amt} !font-semibold`}>{money(r.grossAmount)}</td>
                  <td className={amt}>{money(r.vatAmount)}</td>
                  <td className={amt}>{money(r.netAmount)}</td>
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

import { saleLink, saleCan } from '../../utils/saleLink.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { efdDeviceApi, efdReceiptApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { BanIcon, EyeIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { money as moneyFmt } from '../sales/saleUi.jsx';

// Banners keep their light background but their text is black.
export const NOTICE = '[&>div]:!text-black';
// Status code -> dot colour. The label comes from locales/<lang>/efd.json (receipt.status.<CODE>).
export const STATUS_DOT = { ISSUED: 'bg-emerald-600', VOIDED: 'bg-red-500' };
// Numbers follow the selected language (en-GB / sw-TZ / zh-CN).
export const money = moneyFmt;

// Status as black text with a coloured dot (text itself stays black).
export const Status = ({ status }) => {
  const { t } = useTranslation('efd');
  const dot = STATUS_DOT[status] || 'bg-slate-400';
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 rounded-full ${dot}`} />{t(`receipt.status.${status}`, { defaultValue: status })}</span>;
};

const IconBtn = ({ label, onClick, tone, children }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${tone}`}>
    {children}
  </button>
);

// View + Void. A recorded fiscal receipt has no Edit and no Delete: it can only be voided, with a reason.
export function RowActions({ r, showView, onChanged, onError }) {
  const { t } = useTranslation('efd');
  const { can } = useAuth();
  const navigate = useNavigate();
  const doVoid = async () => {
    const reason = window.prompt(t('receipt.actions.voidPrompt', { no: r.receiptNo }));
    if (!reason || reason.trim().length < 3) return;
    onError('');
    try { await efdReceiptApi.voidReceipt(r.id, reason.trim()); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('receipt.actions.view')} tone="border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => navigate(`/efd-receipts/${r.id}`)}><EyeIcon /></IconBtn>}
      {r.status === 'ISSUED' && can('efd_receipts.void') && <IconBtn label={t('receipt.actions.void')} tone="border-red-200 text-red-600 hover:bg-red-50" onClick={doVoid}><BanIcon /></IconBtn>}
    </div>
  );
}

// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['receiptNo', 'verification', 'order', 'device', 'amount', 'vat', 'issued', 'status', 'actions'];

export default function EfdReceiptsList() {
  const { t } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();                    // lets the device page link here with ?deviceId=
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [status, setStatus] = useState('');
  const [device, setDevice] = useState(params.get('deviceId') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const canFilterDevice = can('efd_devices.read');
  const devs = useLoad(() => (canFilterDevice ? efdDeviceApi.list({ limit: 100 }) : Promise.resolve(null)), [canFilterDevice]);
  const list = useLoad(() => efdReceiptApi.list({ page, limit: 25, ...(q && { search: q }), ...(status && { status }), ...(device && { deviceId: device }), ...(from && { from }), ...(to && { to }) }),
    [page, q, status, device, from, to]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const reset = (set) => (e) => { set(e.target.value); setPage(1); };
  const filtered = q || status || device || from || to;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('receipt.list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('receipt.list.subtitle', { total })}</p>
        </div>
        {can('efd_receipts.create') && <Link to="/efd-receipts/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('receipt.list.record')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('receipt.list.search')} aria-label={t('receipt.list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('shared.filterStatusAria')} value={status} onChange={reset(setStatus)}>
          <option value="">{t('shared.allStatuses')}</option>{Object.keys(STATUS_DOT).map((k) => <option key={k} value={k}>{t(`receipt.status.${k}`)}</option>)}
        </select>
        {canFilterDevice && (
          <select className="input max-w-[14rem] !text-[14px] !text-[#212121]" aria-label={t('shared.filterDeviceAria')} value={device} onChange={reset(setDevice)}>
            <option value="">{t('shared.allDevices')}</option>{(devs.data?.data || []).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.serialNo})</option>)}
          </select>
        )}
        <input className="input max-w-[10rem] !text-[14px] !text-[#212121]" type="date" aria-label={t('shared.fromDateAria')} title={t('shared.fromDateAria')} value={from} max={to || undefined} onChange={reset(setFrom)} />
        <input className="input max-w-[10rem] !text-[14px] !text-[#212121]" type="date" aria-label={t('shared.toDateAria')} title={t('shared.toDateAria')} value={to} min={from || undefined} onChange={reset(setTo)} />
      </div>
      {(err || list.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`receipt.list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('receipt.list.emptyFiltered') : t('receipt.list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.receiptNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.verificationCode || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.sale && (saleCan(can, r.sale.saleType) ? <Link to={saleLink(r.sale.id, r.sale.saleType)} className="text-black underline">{r.sale.saleNo}</Link> : r.sale.saleNo)}</td>
                <td className={`${CELL} text-center`}>{r.device?.name}<div className="text-xs">{r.device?.serialNo}</div></td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.amount)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{money(r.vatAmount)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{fmt(r.issuedAt)}</td>
                <td className={`${CELL} text-center`}><Status status={r.status} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={list.reload} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-[14px]">
        <span>{tc('records', { total })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

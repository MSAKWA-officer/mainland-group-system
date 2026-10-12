import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { efdDeviceApi, errMsg } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { EyeIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../../components/Icons.jsx';
import Pager from '../../components/Pager.jsx';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import useLoad from '../../utils/useLoad';

// Banners keep their light background but their text is black.
export const NOTICE = '[&>div]:!text-black';

// Status as black text with a coloured dot (text itself stays black). The words come from common.json.
export const Status = ({ active }) => {
  const { t } = useTranslation('common');
  return (
    <span className="inline-flex items-center gap-2 text-black">
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-600' : 'bg-slate-400'}`} />{active ? t('active') : t('inactive')}
    </span>
  );
};

const IconBtn = ({ label, onClick, tone, children }) => (
  <button type="button" onClick={onClick} title={label} aria-label={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${tone}`}>
    {children}
  </button>
);
const TONES = {
  view: 'border-blue-200 text-blue-600 hover:bg-blue-50',
  edit: 'border-amber-200 text-amber-600 hover:bg-amber-50',
  off: 'border-slate-300 text-slate-600 hover:bg-slate-100',
  on: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50',
  del: 'border-red-200 text-red-600 hover:bg-red-50',
};

// Icon-only actions: View, Edit, Activate / Deactivate, Delete. Used by this list and by EfdDevicesView.
export function RowActions({ r, showView, onChanged, onError, afterDelete }) {
  const { t } = useTranslation('efdDevices');
  const { can } = useAuth();
  const navigate = useNavigate();
  const toggle = async () => {
    let body = { isActive: true };
    if (r.isActive) {
      const reason = window.prompt(t('actions.deactivatePrompt', { name: r.name }));
      if (!reason || !reason.trim()) return;
      body = { isActive: false, reason: reason.trim() };
    }
    onError('');
    try { await efdDeviceApi.setStatus(r.id, body); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
  const remove = async () => {
    if (!window.confirm(t('actions.deleteConfirm', { name: r.name }))) return;
    onError('');
    try { await efdDeviceApi.remove(r.id); (afterDelete || onChanged)?.(); } catch (x) { onError(errMsg(x)); }
  };
  return (
    <div className="flex items-center gap-2">
      {showView && <IconBtn label={t('actions.view')} tone={TONES.view} onClick={() => navigate(`/efd-devices/${r.id}`)}><EyeIcon /></IconBtn>}
      {can('efd_devices.update') && <IconBtn label={t('actions.edit')} tone={TONES.edit} onClick={() => navigate(`/efd-devices/${r.id}/edit`)}><PencilIcon /></IconBtn>}
      {can('efd_devices.deactivate') && <IconBtn label={r.isActive ? t('actions.deactivate') : t('actions.activate')} tone={r.isActive ? TONES.off : TONES.on} onClick={toggle}><PowerIcon /></IconBtn>}
      {can('efd_devices.delete') && <IconBtn label={t('actions.delete')} tone={TONES.del} onClick={remove}><TrashIcon /></IconBtn>}
    </div>
  );
}

const COLS = ['serialNo', 'name', 'tin', 'vrn', 'location', 'receipts', 'status', 'actions'];

export default function EfdDevicesList() {
  const { t } = useTranslation('efdDevices');
  const { can } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');                       // debounced search term
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const list = useLoad(() => efdDeviceApi.list({ page, limit: 25, ...(q && { search: q }), ...(status && { isActive: status }) }), [page, q, status]);
  const rows = list.data?.data || [];
  const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('list.title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('list.subtitle', { total })}</p>
        </div>
        {can('efd_devices.create') && <Link to="/efd-devices/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('list.new')}</Link>}
      </div>
      <div className="flex flex-wrap gap-3 px-4 pb-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.searchAria')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.filterStatusAria')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('list.allStatuses')}</option><option value="true">{t('common:active')}</option><option value="false">{t('common:inactive')}</option>
        </select>
      </div>
      {(err || list.error || location.state?.msg) && (
        <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{q || status ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{r.serialNo}</td>
                <td className={`${CELL} text-center`}>{r.name}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.tin}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.vrn || '—'}</td>
                <td className={`${CELL} text-center`}>{r.location || '—'}</td>
                <td className={`${CELL} text-center`}>{r.receiptCount ?? 0}</td>
                <td className={`${CELL} text-center`}><Status active={r.isActive} /></td>
                <td className={`${CELL} text-center`}><div className="flex justify-center"><RowActions r={r} showView onChanged={list.reload} onError={setErr} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-1"><Pager page={page} total={total} limit={limit} set={setPage} /></div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Pager from '../../components/Pager.jsx';
import { fmt } from '../../utils/format';
import { CELL, HEAD, al, Errors, Stat, Toolbar, initialPeriod, money, periodError, useEfdReport } from './efdReportUi.jsx';

const COLS = ['issued', 'device', 'receiptNo', 'verification', 'order', 'customer', 'gross', 'vat', 'net', 'status'];

// The receipt register: every EFD receipt in the period, searchable and paged. The CSV holds every row (up to 20,000), not just this page.
export default function EfdReceiptRegister({ devices }) {
  const { t } = useTranslation('efdReports');
  const { t: te } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const [f, setF] = useState({ ...initialPeriod(), deviceId: '', status: '' });
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const err = periodError(f, t);
  const rpt = useEfdReport('receipts', { ...f, search: q, page, limit: 25 }, err);
  const d = rpt.data; const tot = d?.totals; const rows = d?.rows || [];
  const set = (fn) => (v) => { fn(v); setPage(1); };
  return (<>
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
      <Stat label={t('receipts.issued')} value={tot?.issuedCount ?? '—'} /><Stat label={t('w.gross')} value={tot ? money(tot.gross) : '—'} />
      <Stat label={t('w.vat')} value={tot ? money(tot.vat) : '—'} /><Stat label={t('w.voided')} value={tot ? `${tot.voidedCount} · ${money(tot.voidedAmount)}` : '—'} />
    </div>
    <Toolbar f={f} setF={set(setF)} devices={devices} rpt={rpt}>
      <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('receipts.search')} aria-label={t('receipts.searchAria')} maxLength={80} value={search} onChange={(e) => setSearch(e.target.value)} />
      <select className="input max-w-[10rem] !text-[14px] !text-[#212121]" aria-label={te('shared.filterStatusAria')} value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(1); }}>
        <option value="">{te('shared.allStatuses')}</option><option value="ISSUED">{te('receipt.status.ISSUED')}</option><option value="VOIDED">{te('receipt.status.VOIDED')}</option>
      </select>
    </Toolbar>
    <Errors rpt={rpt} err={err} />
    <div className="overflow-x-auto px-4">
      <table className="w-full border-collapse bg-white">
        <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`receipts.columns.${k}`)}</th>)}</tr></thead>
        <tbody>
          {rpt.loading && !d && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{tc('loading')}</td></tr>}
          {!rpt.loading && d && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{t('receipts.empty')}</td></tr>}
          {rows.map((r) => {
            const dead = r.status === 'VOIDED';
            const num = `${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`;
            return (
              <tr key={r.id} className="bg-white">
                <td className={`${CELL} whitespace-nowrap text-left`}>{fmt(r.issuedAt)}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.deviceSerial}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{can('efd_receipts.read') ? <Link to={`/efd-receipts/${r.id}`} className="underline">{r.receiptNo}</Link> : r.receiptNo}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.verificationCode || '—'}</td>
                <td className={`${CELL} whitespace-nowrap text-center`}>{r.saleNo}</td>
                <td className={`${CELL} text-center`}>{r.customerName}{r.customerTin && <div className="text-xs">{t('w.tinLine', { tin: r.customerTin })}</div>}</td>
                <td className={num}>{money(r.amount)}</td><td className={num}>{money(r.vatAmount)}</td><td className={num}>{money(r.net)}</td>
                <td className={`${CELL} text-center`}><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${dead ? 'bg-red-500' : 'bg-emerald-600'}`} />{te(`receipt.status.${r.status}`, { defaultValue: r.status })}</span>{dead && r.voidReason && <div className="text-xs">{r.voidReason}</div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="px-3"><Pager page={page} total={d?.total || 0} limit={d?.limit || 25} set={setPage} /></div>
  </>);
}

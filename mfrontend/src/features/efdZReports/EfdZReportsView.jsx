import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { efdZReportApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, RowActions, Status, day, money } from './EfdZReportsList.jsx';
import { Row } from '../banking/bankingUi.jsx';

// A difference of 0 is fine; anything else is shown in red/amber so it is noticed before verifying.
const Diff = ({ v, count }) => {
  const n = Number(v);
  const zero = n === 0;
  const text = count ? String(n) : money(Math.abs(n));
  return <span className={zero ? 'text-black' : 'font-semibold text-red-600'}>{zero ? '0' : `${n < 0 ? '−' : '+'}${text}`}</span>;
};

export default function EfdZReportsView() {
  const { t } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const q = useLoad(() => efdZReportApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const changed = (m) => { setOk(m || ''); q.reload(); };
  const heads = ['', t('z.view.colZ'), t('z.view.colSystem'), t('z.view.colDiff')];
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? t('z.view.title', { no: r.reportNo }) : t('z.view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status status={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/efd-z-reports" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('shared.backToList')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('z.view.reportNo')}>{r.reportNo}</Row>
            <Row label={t('z.view.reportDate')}>{day(r.reportDate)}</Row>
            <Row label={t('z.view.device')}>{r.device && (can('efd_devices.read')
              ? <Link to={`/efd-devices/${r.device.id}`} className="text-black underline">{r.device.name} ({r.device.serialNo})</Link> : `${r.device.name} (${r.device.serialNo})`)}</Row>
            <Row label={t('shared.sellerTin')}>{r.device?.tin}</Row>
            <Row label={t('z.view.zNumber')}>{r.zNumber}</Row>
            <Row label={t('z.view.firstReceiptNo')}>{r.firstReceiptNo}</Row>
            <Row label={t('z.view.lastReceiptNo')}>{r.lastReceiptNo}</Row>
            <Row label={t('z.view.notes')}>{r.notes}</Row>
            <Row label={t('shared.status')}><Status status={r.status} /></Row>
            {['VERIFIED', 'REJECTED'].includes(r.status) && (<>
              <Row label={r.status === 'VERIFIED' ? t('z.view.verifiedBy') : t('z.view.rejectedBy')}>{r.decider?.fullName}</Row>
              <Row label={t('z.view.decided')}>{fmt(r.decidedAt)}</Row>
              <Row label={t('z.view.decisionNote')}>{r.decisionNote}</Row>
            </>)}
            {r.status === 'VOIDED' && (<>
              <Row label={t('shared.voidReason')}>{r.voidReason}</Row>
              <Row label={t('shared.voided')}>{fmt(r.voidedAt)}</Row>
              <Row label={t('shared.voidedBy')}>{r.voider?.fullName}</Row>
            </>)}
            <Row label={t('shared.recordedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('shared.recorded')}>{fmt(r.createdAt)}</Row>
          </dl>

          <h2 className="mt-6 text-lg font-semibold">{t('z.view.compareTitle')}</h2>
          <p className="mt-1 text-sm">{t('z.view.compareHelp')}</p>
          <div className="mt-3 max-w-3xl overflow-x-auto rounded-md border border-line">
            <table className="w-full">
              <thead className="bg-slate-50"><tr>{heads.map((h, i) => <th key={i} className={`th px-4 py-2 font-normal uppercase text-black ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                <tr><td className="td px-4 text-black">{t('shared.receipts')}</td><td className="td px-4 text-right text-black">{r.receiptsCount}</td><td className="td px-4 text-right text-black">{r.system?.receiptsCount ?? 0}</td><td className="td px-4 text-right"><Diff v={r.difference?.receiptsCount} count /></td></tr>
                <tr><td className="td px-4 text-black">{t('shared.gross')}</td><td className="td px-4 text-right text-black">{money(r.grossAmount)}</td><td className="td px-4 text-right text-black">{money(r.system?.grossAmount)}</td><td className="td px-4 text-right"><Diff v={r.difference?.grossAmount} /></td></tr>
                <tr><td className="td px-4 text-black">{t('shared.vat')}</td><td className="td px-4 text-right text-black">{money(r.vatAmount)}</td><td className="td px-4 text-right text-black">{money(r.system?.vatAmount)}</td><td className="td px-4 text-right"><Diff v={r.difference?.vatAmount} /></td></tr>
                <tr><td className="td px-4 text-black">{t('z.view.net')}</td><td className="td px-4 text-right text-black">{money(r.netAmount)}</td><td className="td px-4 text-right text-black">—</td><td className="td px-4 text-right text-black">—</td></tr>
                <tr><td className="td px-4 text-black">{t('z.view.voidedReceipts')}</td><td className="td px-4 text-right text-black">{r.voidedCount} · {money(r.voidedAmount)}</td><td className="td px-4 text-right text-black">{r.system?.voidedCount ?? 0} · {money(r.system?.voidedAmount)}</td><td className="td px-4 text-right text-black">—</td></tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 pb-2"><RowActions r={r} onChanged={changed} onError={setErr} /></div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { efdReconciliationApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { FiguresTable, NOTICE, Row, Status, day, money } from './reconUi.jsx';
import { RowActions } from './EfdReconciliationsList.jsx';

const RECEIPT_DOT = { ISSUED: 'bg-emerald-600', VOIDED: 'bg-red-500' };

export default function EfdReconciliationsView() {
  const { t } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can, user } = useAuth();
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [why, setWhy] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const q = useLoad(() => efdReconciliationApi.get(id), [id]);
  const r = q.data;
  const msg = ok || location.state?.msg;
  const changed = (m) => { setOk(m || ''); q.reload(); };

  const open = r?.status === 'OPEN';
  const mine = r && r.createdBy === user?.id;
  const zOk = r?.zReport?.status === 'VERIFIED';
  const canSign = open && can('efd_reconciliations.reconcile') && (!mine || user?.role === 'OWNER');
  const needWhy = !!r?.hasDifference;
  const zStatus = (s) => t(`z.status.${s}`, { defaultValue: s }).toLowerCase();
  const signOff = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setOk('');
    if (needWhy && why.trim().length < 10) { setFe({ explanation: t('recon.view.explanationError') }); return; }
    setBusy(true);
    try { await efdReconciliationApi.reconcile(id, why.trim()); setWhy(''); changed(t('recon.view.signed')); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); }
    setBusy(false);
  };
  const receiptHeads = ['receiptNo', 'issued', 'amount', 'vat', 'status'];

  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? t('recon.view.title', { no: r.reconNo }) : t('recon.view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status status={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/efd-reconciliations" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('shared.backToList')}</Link>
      </div>
      {(err || q.error || msg) && <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{msg}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('recon.view.day')}>{day(r.reconDate)}</Row>
            <Row label={t('recon.view.device')}>{r.device && (can('efd_devices.read')
              ? <Link to={`/efd-devices/${r.device.id}`} className="text-black underline">{r.device.name} ({r.device.serialNo})</Link> : `${r.device.name} (${r.device.serialNo})`)}</Row>
            <Row label={t('recon.view.zReport')}>{r.zReport && (<>
              {can('efd_z_reports.read') ? <Link to={`/efd-z-reports/${r.zReport.id}`} className="text-black underline">{r.zReport.reportNo}</Link> : r.zReport.reportNo}
              {' '}{t('recon.view.zReportInfo', { z: r.zReport.zNumber, status: zStatus(r.zReport.status) })}
            </>)}</Row>
            <Row label={t('recon.view.refreshedAt')}>{fmt(r.refreshedAt)}</Row>
            <Row label={t('recon.view.startedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('recon.view.started')}>{fmt(r.createdAt)}</Row>
            {r.status === 'RECONCILED' && (<>
              <Row label={t('recon.view.signedOffBy')}>{r.reconciler?.fullName}</Row>
              <Row label={t('recon.view.signedOff')}>{fmt(r.reconciledAt)}</Row>
              <Row label={t('recon.view.explanation')}>{r.explanation}</Row>
            </>)}
            {r.status === 'VOIDED' && (<>
              <Row label={t('shared.voidReason')}>{r.voidReason}</Row>
              <Row label={t('shared.voided')}>{fmt(r.voidedAt)}</Row>
              <Row label={t('shared.voidedBy')}>{r.voider?.fullName}</Row>
            </>)}
          </dl>

          <h2 className="mt-6 text-lg font-semibold">{t('recon.view.compareTitle')}</h2>
          <p className="mb-3 mt-1 text-sm">{t('recon.view.compareHelp')}</p>
          <FiguresTable f={r} />
          {r.hasDifference && r.status !== 'VOIDED' && <div className={`mt-3 max-w-3xl ${NOTICE}`}><Banner>{Number(r.unreceiptedOrdersCount) > 0 ? t('recon.view.diffBannerUnreceipted') : t('recon.view.diffBanner')}</Banner></div>}

          {open && (
            <div className="mt-6 max-w-3xl rounded-md border border-line p-4">
              <h2 className="text-lg font-semibold">{t('recon.view.signTitle')}</h2>
              {!zOk && <div className={`mt-2 ${NOTICE}`}><Banner>{t('recon.view.zNotVerified', { status: zStatus(r.zReport?.status) })}</Banner></div>}
              {mine && user?.role !== 'OWNER' && <div className={`mt-2 ${NOTICE}`}><Banner>{t('recon.view.mine')}</Banner></div>}
              {canSign && (
                <form onSubmit={signOff} className="mt-3 space-y-3 [&_.text-danger]:!text-black">
                  {needWhy && (
                    <Field label={t('recon.view.explanationLabel')} error={fe.explanation}>
                      <textarea className="input" rows={3} maxLength={1000} required minLength={10} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t('recon.view.explanationPlaceholder')} />
                    </Field>
                  )}
                  {!needWhy && <p className="text-sm">{t('recon.view.matchNote')}</p>}
                  <button className="btn-primary" disabled={busy || !zOk}>{busy ? t('recon.view.signing') : t('recon.view.signBtn')}</button>
                </form>
              )}
              {!canSign && !mine && <p className="mt-2 text-sm">{t('recon.view.noPermission')}</p>}
            </div>
          )}

          <h2 className="mt-6 text-lg font-semibold">{t('recon.view.receiptsTitle')}</h2>
          <p className="mb-3 mt-1 text-sm">{t('recon.view.receiptsHelp', { limit: r.receipts?.length >= 500 ? t('recon.view.first500') : '' })}</p>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full">
              <thead className="bg-slate-50"><tr>{receiptHeads.map((k) => <th key={k} className={`th px-4 py-2 font-normal uppercase text-black ${['amount', 'vat'].includes(k) ? 'text-right' : ''}`}>{t(`recon.view.receiptCols.${k}`)}</th>)}</tr></thead>
              <tbody>
                {(r.receipts || []).length === 0 && <tr><td className="td px-4 text-black" colSpan={5}>{t('recon.view.noReceipts')}</td></tr>}
                {(r.receipts || []).map((x) => {
                  const dot = RECEIPT_DOT[x.status] || 'bg-slate-400';
                  const dead = x.status === 'VOIDED';
                  return (
                    <tr key={x.id} className="odd:bg-slate-50/60">
                      <td className="td whitespace-nowrap px-4 font-medium text-black">{can('efd_receipts.read') ? <Link to={`/efd-receipts/${x.id}`} className="underline">{x.receiptNo}</Link> : x.receiptNo}</td>
                      <td className="td whitespace-nowrap px-4 text-black">{fmt(x.issuedAt)}</td>
                      <td className={`td whitespace-nowrap px-4 text-right ${dead ? 'text-slate-500 line-through' : 'text-black'}`}>{money(x.amount)}</td>
                      <td className={`td whitespace-nowrap px-4 text-right ${dead ? 'text-slate-500 line-through' : 'text-black'}`}>{money(x.vatAmount)}</td>
                      <td className="td px-4"><span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 rounded-full ${dot}`} />{t(`receipt.status.${x.status}`, { defaultValue: x.status })}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pb-2"><RowActions r={r} hideReconcile onChanged={changed} onError={setErr} /></div>
        </div>
      )}
    </div>
  );
}

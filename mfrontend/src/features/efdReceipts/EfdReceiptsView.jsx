import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { efdReceiptApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, RowActions, Status, money } from './EfdReceiptsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

export default function EfdReceiptsView() {
  const { t } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => efdReceiptApi.get(id), [id]);
  const r = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? t('receipt.view.title', { no: r.receiptNo }) : t('receipt.view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status status={r.status} /> : tc('loading')}</p>
        </div>
        <Link to="/efd-receipts" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('shared.backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('receipt.view.receiptNo')}>{r.receiptNo}</Row>
            <Row label={t('receipt.view.verification')}>{r.verificationCode}</Row>
            <Row label={t('receipt.view.order')}>{r.order && (can('sales_orders.read')
              ? <Link to={`/sales-orders/${r.order.id}`} className="text-black underline">{r.order.orderNo}</Link> : r.order.orderNo)}</Row>
            <Row label={t('receipt.view.device')}>{r.device && (can('efd_devices.read')
              ? <Link to={`/efd-devices/${r.device.id}`} className="text-black underline">{r.device.name} ({r.device.serialNo})</Link> : `${r.device.name} (${r.device.serialNo})`)}</Row>
            <Row label={t('shared.sellerTin')}>{r.device?.tin}</Row>
            <Row label={t('receipt.view.customerTin')}>{r.customerTin}</Row>
            <Row label={t('receipt.view.amount')}>{money(r.amount)}</Row>
            <Row label={t('receipt.view.vat')}>{money(r.vatAmount)}</Row>
            <Row label={t('receipt.view.issued')}>{fmt(r.issuedAt)}</Row>
            <Row label={t('shared.status')}><Status status={r.status} /></Row>
            {r.status === 'VOIDED' && (<>
              <Row label={t('shared.voidReason')}>{r.voidReason}</Row>
              <Row label={t('shared.voided')}>{fmt(r.voidedAt)}</Row>
              <Row label={t('shared.voidedBy')}>{r.voider?.fullName}</Row>
            </>)}
            <Row label={t('shared.recordedBy')}>{r.creator?.fullName}</Row>
            <Row label={t('shared.recorded')}>{fmt(r.createdAt)}</Row>
          </dl>
          <div className="mt-4 pb-2"><RowActions r={r} onChanged={q.reload} onError={setErr} /></div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { efdDeviceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { Row } from '../banking/bankingUi.jsx';
import { NOTICE, RowActions, Status } from './EfdDevicesList.jsx';

export default function EfdDevicesView() {
  const { t } = useTranslation('efdDevices');
  const { t: te } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => efdDeviceApi.get(id), [id]);
  const r = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.name : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status active={r.isActive} /> : tc('loading')}</p>
        </div>
        <Link to="/efd-devices" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{te('shared.backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.serialNo')}>{r.serialNo}</Row>
            <Row label={t('view.name')}>{r.name}</Row>
            <Row label={t('view.tin')}>{r.tin}</Row>
            <Row label={t('view.vrn')}>{r.vrn}</Row>
            <Row label={t('view.location')}>{r.location}</Row>
            <Row label={t('view.receipts')}>{can('efd_receipts.read') && r.receiptCount
              ? <Link to={`/efd-receipts?deviceId=${r.id}`} className="text-black underline">{r.receiptCount}</Link> : String(r.receiptCount ?? 0)}</Row>
            <Row label={t('view.status')}><Status active={r.isActive} /></Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/efd-devices', { state: { msg: t('actions.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

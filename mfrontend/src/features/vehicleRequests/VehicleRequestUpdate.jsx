import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMsg, fieldErrs, vehicleRequestApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import VehicleRequestForm, { EMPTY, fromRequest, toBody } from './VehicleRequestForm.jsx';

// Only the person who raised the request can edit it, and only while it is still PENDING.
export default function VehicleRequestUpdate() {
  const { t } = useTranslation('vehicleRequests');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLoad(() => vehicleRequestApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const r = item.data;
  useEffect(() => { if (r) setF(fromRequest(r)); }, [r]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await vehicleRequestApi.update(id, toBody(f)); navigate(`/vehicle-requests/${id}`, { state: { msg: t('update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={r ? t('update.titleNo', { no: r.requestNo }) : t('update.title')} sub={r ? '' : tc('loading')}>
        <Link to={`/vehicle-requests/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner>{r && r.status !== 'PENDING' && <Banner>{t('update.locked')}</Banner>}</div>
        {r && <VehicleRequestForm f={f} setF={setF} fe={fe} />}
        <button className="btn-primary" disabled={busy || !r || r.status !== 'PENDING'}>{busy ? t('update.saving') : t('update.submit')}</button>
      </form>
    </div>
  );
}

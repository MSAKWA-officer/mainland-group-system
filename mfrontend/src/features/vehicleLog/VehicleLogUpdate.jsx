import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMsg, fieldErrs, vehicleLogApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import VehicleLogForm, { EMPTY, fromTrip, toBody } from './VehicleLogForm.jsx';

// Edit a trip, or close an open one (fill the ending time and final mileage). Only the person who recorded it, and only while it is active.
export default function VehicleLogUpdate() {
  const { t } = useTranslation('vehicleLog');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLoad(() => vehicleLogApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const x = item.data;
  useEffect(() => { if (x) setF(fromTrip(x)); }, [x]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await vehicleLogApi.update(id, toBody(f)); navigate(`/vehicle-log/${id}`, { state: { msg: t('update.saved') } }); }
    catch (z) { setErr(errMsg(z)); setFe(fieldErrs(z)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={x ? t('update.titleNo', { no: x.tripNo }) : t('update.title')} sub={x ? `${x.vehicle?.plateNo}` : tc('loading')}>
        <Link to={`/vehicle-log/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner>{x && x.status !== 'ACTIVE' && <Banner>{t('update.locked')}</Banner>}</div>
        {x && <VehicleLogForm f={f} setF={setF} fe={fe} />}
        <button className="btn-primary" disabled={busy || !x || x.status !== 'ACTIVE'}>{busy ? t('update.saving') : t('update.submit')}</button>
      </form>
    </div>
  );
}

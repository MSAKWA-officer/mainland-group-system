import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, fieldErrs, vehicleRequestApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import VehicleRequestForm, { EMPTY, toBody } from './VehicleRequestForm.jsx';

export default function VehicleRequestCreate() {
  const { t } = useTranslation('vehicleRequests');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [f, setF] = useState({ ...EMPTY, userName: user?.fullName || '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { const r = await vehicleRequestApi.create(toBody(f)); navigate(`/vehicle-requests/${r.id}`, { state: { msg: t('create.saved', { no: r.requestNo }) } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/vehicle-requests" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <VehicleRequestForm f={f} setF={setF} fe={fe} />
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.submit')}</button>
      </form>
    </div>
  );
}

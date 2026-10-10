import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, fieldErrs, fuelFundingApi, vehicleApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { NOTICE, PageHead, vehicleOption } from '../fuel/fuelUi.jsx';
import FuelFundingForm, { EMPTY, toBody } from './FuelFundingForm.jsx';

// A request waits for approval; the money only leaves (and a bank withdrawal is only posted) when an approver approves it.
// Open it from a vehicle (?vehicleId=...) to start with that vehicle chosen.
export default function FuelFundingCreate() {
  const { t } = useTranslation('fuelFunding');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const pre = sp.get('vehicleId');
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (pre) vehicleApi.get(pre).then((v) => setF((p) => ({ ...p, vehicle: vehicleOption(v) })), (x) => setErr(errMsg(x))); }, [pre]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!f.vehicle) { setFe({ vehicleId: t('create.chooseVehicle') }); return; }
    setBusy(true);
    try {
      const x = await fuelFundingApi.create(toBody(f));
      navigate(`/fuel-funding/${x.id}`, { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/fuel-funding" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <FuelFundingForm f={f} setF={setF} fe={fe} />
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.submit')}</button>
      </form>
    </div>
  );
}

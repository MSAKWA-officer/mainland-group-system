import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMsg, fieldErrs, vehicleApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import VehiclesForm, { EMPTY, fromVehicle, toBody } from './VehiclesForm.jsx';

export default function VehiclesUpdate() {
  const { t } = useTranslation('vehicles');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const item = useLoad(() => vehicleApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const v = item.data;
  useEffect(() => { if (v) setF(fromVehicle(v)); }, [v]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await vehicleApi.update(id, toBody(f, can('vehicles.assign'))); navigate(`/vehicles/${id}`, { state: { msg: t('update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('update.title')} sub={v ? `${v.code} · ${v.plateNo}` : tc('loading')}>
        <Link to={`/vehicles/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner></div>
        {v && (<>
          <VehiclesForm f={f} setF={setF} fe={fe} />
          <button className="btn-primary" disabled={busy}>{busy ? t('update.saving') : t('update.submit')}</button>
        </>)}
      </form>
    </div>
  );
}

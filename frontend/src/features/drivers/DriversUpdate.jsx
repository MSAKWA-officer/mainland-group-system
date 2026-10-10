import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { driverApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import DriversForm, { EMPTY, fromDriver, toBody } from './DriversForm.jsx';

export default function DriversUpdate() {
  const { t } = useTranslation('drivers');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLoad(() => driverApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = item.data;
  useEffect(() => { if (d) setF(fromDriver(d)); }, [d]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await driverApi.update(id, toBody(f)); navigate(`/drivers/${id}`, { state: { msg: t('update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('update.title')} sub={d ? `${d.code} · ${d.fullName}` : tc('loading')}>
        <Link to={`/drivers/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner></div>
        {d && (<>
          <DriversForm f={f} setF={setF} fe={fe} />
          <button className="btn-primary" disabled={busy}>{busy ? t('update.saving') : t('update.submit')}</button>
        </>)}
      </form>
    </div>
  );
}

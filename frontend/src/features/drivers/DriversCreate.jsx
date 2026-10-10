import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { driverApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { NOTICE, PageHead, today } from '../fuel/fuelUi.jsx';
import DriversForm, { EMPTY, toBody } from './DriversForm.jsx';

export default function DriversCreate() {
  const { t } = useTranslation('drivers');
  const navigate = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      const x = await driverApi.create(toBody(f));
      navigate(`/drivers/${x.id}`, { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/drivers" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <DriversForm f={f} setF={setF} fe={fe} minExpiry={today()} />
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.submit')}</button>
      </form>
    </div>
  );
}

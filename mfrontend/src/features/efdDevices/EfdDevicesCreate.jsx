import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { efdDeviceApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { PageHead } from '../banking/bankingUi.jsx';
import EfdDeviceForm, { EMPTY, toBody } from './EfdDeviceForm.jsx';
import { NOTICE } from './EfdDevicesList.jsx';

// "New EFD device" (/efd-devices/new).
export default function EfdDevicesCreate() {
  const { t } = useTranslation('efdDevices');
  const { t: te } = useTranslation('efd');
  const navigate = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await efdDeviceApi.create(toBody(f)); navigate('/efd-devices', { state: { msg: t('create.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/efd-devices" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{te('shared.backToList')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <EfdDeviceForm f={f} setF={setF} fe={fe} />
        <button className="btn-primary" disabled={busy}>{busy ? te('shared.saving') : t('create.submit')}</button>
      </form>
    </div>
  );
}

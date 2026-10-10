import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { efdDeviceApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { PageHead } from '../banking/bankingUi.jsx';
import EfdDeviceForm, { EMPTY, fromDevice, toBody } from './EfdDeviceForm.jsx';
import { NOTICE } from './EfdDevicesList.jsx';

// "Edit EFD device" (/efd-devices/:id/edit).
export default function EfdDevicesUpdate() {
  const { t } = useTranslation('efdDevices');
  const { t: te } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const cur = useLoad(() => efdDeviceApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = cur.data;
  useEffect(() => { if (d) setF(fromDevice(d)); }, [d]);
  const locked = !!d && d.receiptCount > 0;            // the server refuses a serial change once receipts exist
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await efdDeviceApi.update(id, toBody(f)); navigate(`/efd-devices/${id}`, { state: { msg: t('update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('update.title')} sub={d ? `${d.serialNo} · ${d.name}` : tc('loading')}>
        <Link to={`/efd-devices/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{te('shared.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || cur.error}</Banner></div>
        {d && (<>
          <EfdDeviceForm f={f} setF={setF} fe={fe} locked={locked} />
          <button className="btn-primary" disabled={busy}>{busy ? te('shared.saving') : t('update.submit')}</button>
        </>)}
      </form>
    </div>
  );
}

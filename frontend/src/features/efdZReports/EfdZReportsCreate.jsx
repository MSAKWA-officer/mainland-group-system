import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { efdZReportApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { NOTICE, PageHead } from '../banking/bankingUi.jsx';
import EfdZReportForm, { EMPTY, toBody } from './EfdZReportForm.jsx';

// The report waits for another person to verify it. Open it from a device (?deviceId=...) to start with that device chosen.
export default function EfdZReportsCreate() {
  const { t } = useTranslation('efd');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const pre = sp.get('deviceId');
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (pre) setF((p) => (p.deviceId ? p : { ...p, deviceId: pre })); }, [pre]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (Number(f.vatAmount) > Number(f.grossAmount)) { setFe({ vatAmount: t('z.create.vatError') }); return; }
    setBusy(true);
    try {
      const r = await efdZReportApi.create(toBody(f, { create: true }));
      navigate(`/efd-z-reports/${r.id}`, { state: { msg: t('z.create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('z.create.title')} sub={t('z.create.sub')}>
        <Link to="/efd-z-reports" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('shared.backToList')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <EfdZReportForm f={f} setF={setF} fe={fe} />
        <button className="btn-primary" disabled={busy}>{busy ? t('shared.saving') : t('z.create.submit')}</button>
      </form>
    </div>
  );
}

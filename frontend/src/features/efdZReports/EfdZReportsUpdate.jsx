import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { efdZReportApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead } from '../banking/bankingUi.jsx';
import EfdZReportForm, { EMPTY, fromReport, toBody } from './EfdZReportForm.jsx';

// Only the person who recorded the report can edit it, and only while it is still waiting for verification.
export default function EfdZReportsUpdate() {
  const { t } = useTranslation('efd');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const item = useLoad(() => efdZReportApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const r = item.data;
  useEffect(() => { if (r) setF(fromReport(r)); }, [r]);
  const notMine = r && r.createdBy !== user?.id;
  const locked = r && r.status !== 'PENDING';
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (Number(f.vatAmount) > Number(f.grossAmount)) { setFe({ vatAmount: t('z.create.vatError') }); return; }
    setBusy(true);
    try { await efdZReportApi.update(id, toBody(f)); navigate(`/efd-z-reports/${id}`, { state: { msg: t('z.update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('z.update.title')} sub={r ? `${r.reportNo} · ${r.device?.name || ''}` : tc('loading')}>
        <Link to={`/efd-z-reports/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('shared.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}>
          <Banner>{err || item.error}</Banner>
          {locked && <Banner>{t('z.update.locked', { status: t(`z.status.${r.status}`, { defaultValue: r.status }).toLowerCase() })}</Banner>}
          {!locked && notMine && <Banner>{t('z.update.notMine')}</Banner>}
        </div>
        {r && !locked && !notMine && (<>
          <EfdZReportForm f={f} setF={setF} fe={fe} device={r.device} />
          <button className="btn-primary" disabled={busy}>{busy ? t('shared.saving') : t('z.update.submit')}</button>
        </>)}
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMsg, fieldErrs, fuelFundingApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import FuelFundingForm, { EMPTY, fromFunding, toBody } from './FuelFundingForm.jsx';

// Only the person who raised the request can edit it, and only while it is still waiting for a decision.
export default function FuelFundingUpdate() {
  const { t } = useTranslation('fuelFunding');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const item = useLoad(() => fuelFundingApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const r = item.data;
  useEffect(() => { if (r) setF(fromFunding(r)); }, [r]);
  const notMine = r && r.createdBy !== user?.id;
  const locked = r && r.status !== 'PENDING';
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await fuelFundingApi.update(id, toBody(f)); navigate(`/fuel-funding/${id}`, { state: { msg: t('update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('update.title')} sub={r ? `${r.fundingNo} · ${r.vehicle?.plateNo}` : tc('loading')}>
        <Link to={`/fuel-funding/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}>
          <Banner>{err || item.error}</Banner>
          {locked && <Banner>{t('update.locked', { status: t(`status.${r.status}`, { defaultValue: r.status }).toLowerCase() })}</Banner>}
          {!locked && notMine && <Banner>{t('update.notMine')}</Banner>}
        </div>
        {r && !locked && !notMine && (<>
          <FuelFundingForm f={f} setF={setF} fe={fe} editing />
          <button className="btn-primary" disabled={busy}>{busy ? t('update.saving') : t('update.submit')}</button>
        </>)}
      </form>
    </div>
  );
}

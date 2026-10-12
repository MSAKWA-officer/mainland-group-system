import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMsg, fieldErrs, fuelBalanceApi, fuelUsageApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead, fromCents, toCents } from '../fuel/fuelUi.jsx';
import FuelUsageForm, { EMPTY, fromUsage, toBody } from './FuelUsageForm.jsx';

// Only the person who recorded the usage can edit it, and only while it is still active. The funding itself cannot be changed.
export default function FuelUsageUpdate() {
  const { t } = useTranslation('fuelUsage');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLoad(() => fuelUsageApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [bal, setBal] = useState(null);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const u = item.data;
  useEffect(() => { if (u) { setF(fromUsage(u)); fuelBalanceApi.get(u.fuelFundingId).then(setBal).catch(() => setBal(null)); } }, [u]);
  const locked = u && u.status !== 'ACTIVE';
  // The balance already counts this record as spent, so what can be recorded is the balance plus this record's own amount.
  const available = bal && u ? fromCents(toCents(bal.balance) + toCents(u.amount)) : null;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await fuelUsageApi.update(id, toBody(f)); navigate(`/fuel-usage/${id}`, { state: { msg: t('update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('update.title')} sub={u ? `${u.usageNo} · ${u.funding?.fundingNo} · ${u.vehicle?.plateNo}` : tc('loading')}>
        <Link to={`/fuel-usage/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner>{locked && <Banner>{t('update.locked', { status: t(`status.${u.status}`, { defaultValue: u.status }).toLowerCase() })}</Banner>}</div>
        {u && !locked && (<>
          <FuelUsageForm f={f} setF={setF} fe={fe} funding={bal} available={available} />
          <button className="btn-primary" disabled={busy}>{busy ? t('update.saving') : t('update.submit')}</button>
        </>)}
      </form>
    </div>
  );
}

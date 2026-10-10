import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, fieldErrs, fuelBalanceApi, fuelUsageApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { NOTICE, PageHead } from '../fuel/fuelUi.jsx';
import FuelUsageForm, { EMPTY, toBody, toOption } from './FuelUsageForm.jsx';

// Usage is recorded against an approved funding that still has money left. Open it from a balance (?fundingId=...) or pick it here.
export default function FuelUsageCreate() {
  const { t } = useTranslation('fuelUsage');
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const pre = sp.get('fundingId');
  const [funding, setFunding] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (pre) fuelBalanceApi.get(pre).then((b) => setFunding(toOption(b))).catch((x) => setErr(errMsg(x))); }, [pre]);
  const load = async (s) => (await fuelBalanceApi.list({ state: 'OPEN', limit: 20, ...(s && { search: s }) })).data.map(toOption);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    if (!funding) { setFe({ fuelFundingId: t('create.chooseFunding') }); return; }
    setBusy(true);
    try {
      const x = await fuelUsageApi.create({ fuelFundingId: funding.id, ...toBody(f) });
      navigate(`/fuel-usage/${x.id}`, { state: { msg: t('create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('create.title')} sub={t('create.sub')}>
        <Link to="/fuel-usage" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <div className="max-w-3xl">
          <Field label={t('create.funding')} error={fe.fuelFundingId}>
            <Picker value={funding?.id} selected={funding} load={load} onPick={setFunding} placeholder={t('create.selectFunding')} required />
          </Field>
          <p className="mt-1 text-xs">{t('create.hint')}</p>
        </div>
        <FuelUsageForm f={f} setF={setF} fe={fe} funding={funding} available={funding ? Number(funding.balance) : null} />
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.submit')}</button>
      </form>
    </div>
  );
}

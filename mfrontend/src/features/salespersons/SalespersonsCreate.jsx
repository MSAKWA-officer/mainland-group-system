import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errMsg, fieldErrs, salespersonApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import SalespersonForm, { EMPTY, toBody } from './SalespersonForm.jsx';
import { NOTICE } from './SalespersonsList.jsx';

export default function SalespersonsCreate() {
  const { t } = useTranslation('salespersons');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      await salespersonApi.create(toBody(f, { canLink: can('users.read'), canPay: can('salespersons.view_commission'), creating: true }));
      navigate('/salespersons', { state: { msg: t('create.done') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/salespersons" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <SalespersonForm f={f} setF={setF} fe={fe} />
        <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('create.save')}</button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { creditSaleApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { NOTICE } from '../sales/saleUi.jsx';
import CreditSalesForm, { EMPTY, problem, todayStr, toBody } from './CreditSalesForm.jsx';

export default function CreditSalesCreate() {
  const { t } = useTranslation('creditSales');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    const p = problem(f, todayStr()); if (p) { setErr(p); return; }
    setBusy(true);
    try {
      const s = await creditSaleApi.create(toBody(f, { canSetPrice: can('credit_sales.set_price'), canPickSalesperson: can('credit_sales.read_all') }));
      navigate(`/credit-sales/${s.id}`, { state: { msg: t('create.done') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/credit-sales" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <CreditSalesForm f={f} setF={setF} fe={fe} />
        <button className="btn-primary" disabled={busy}>{busy ? t('create.saving') : t('create.save')}</button>
      </form>
    </div>
  );
}

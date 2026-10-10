import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { creditSaleApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE } from '../sales/saleUi.jsx';
import CreditSalesForm, { EMPTY, fromSale, problem, todayStr, toBody } from './CreditSalesForm.jsx';

// Only a DRAFT can be edited, and only by its creator (the API enforces this too).
export default function CreditSalesUpdate() {
  const { t } = useTranslation('creditSales');
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const item = useLoad(() => creditSaleApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const s = item.data;
  useEffect(() => { if (s) setF(fromSale(s)); }, [s]);
  const editable = s && s.status === 'DRAFT' && s.createdBy === user.id;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    const p = problem(f, todayStr()); if (p) { setErr(p); return; }
    setBusy(true);
    try {
      await creditSaleApi.update(id, toBody(f, { canSetPrice: can('credit_sales.set_price'), canPickSalesperson: can('credit_sales.read_all') }));
      navigate(`/credit-sales/${id}`, { state: { msg: t('update.done') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('update.title')}</h1>
          <p className="mt-1 text-sm">{s ? t('update.subtitle', { no: s.saleNo }) : t('update.loading')}</p>
        </div>
        <Link to={`/credit-sales/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}>
          <Banner>{err || item.error}</Banner>
          {s && !editable && <Banner>{t('update.notEditable', { status: t(`sales:status.${s.status}`, { defaultValue: s.status }).toLowerCase() })}</Banner>}
        </div>
        {editable && (<>
          <CreditSalesForm f={f} setF={setF} fe={fe} />
          <button className="btn-primary" disabled={busy}>{busy ? t('update.saving') : t('update.save')}</button>
        </>)}
      </form>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, fieldErrs, salesOrderApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import SalesOrderForm, { EMPTY, problem, toBody } from './SalesOrderForm.jsx';
import { NOTICE } from './SalesOrdersList.jsx';

// Create (the C of CRUD). The salesperson chooses Cash or Credit here. "Save as draft" keeps it editable;
// "Save and submit" also sends it for approval. After approval the sale is created automatically (Sales + Cash sales / Credit sales pages).
export default function SalesOrdersCreate() {
  const { t } = useTranslation('salesOrders');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const save = async (andSubmit) => {
    setErr(''); setFe({});
    const p = problem(f, t); if (p) { setErr(p); return; }
    setBusy(true);
    let o;
    try {
      o = await salesOrderApi.create(toBody(f, { canSetPrice: can('sales_orders.set_price'), canPickSalesperson: can('sales_orders.read_all') }));
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); return; }
    if (!andSubmit) { navigate(`/sales-orders/${o.id}`, { state: { msg: t('create.saved') } }); return; }
    try {
      await salesOrderApi.submit(o.id);
      navigate(`/sales-orders/${o.id}`, { state: { msg: t('create.savedSubmitted') } });
    } catch (x) { navigate(`/sales-orders/${o.id}`, { state: { msg: t('create.savedSubmitFailed', { error: errMsg(x) }) } }); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/sales-orders" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('create.back')}</Link>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err}</Banner></div>
        <SalesOrderForm f={f} setF={setF} fe={fe} />
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('create.save')}</button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => save(true)}>{t('create.saveSubmit')}</button>
        </div>
      </form>
    </div>
  );
}

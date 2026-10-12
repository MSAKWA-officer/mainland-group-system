import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMsg, fieldErrs, salesOrderApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { currentLocale } from '../../utils/locale';
import useLoad from '../../utils/useLoad';
import SalesOrderForm, { EMPTY, fromOrder, problem, toBody } from './SalesOrderForm.jsx';
import { NOTICE } from './SalesOrdersList.jsx';

// Only a DRAFT can be edited, and only by its creator (the API enforces this too).
export default function SalesOrdersUpdate() {
  const { t } = useTranslation('salesOrders');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const item = useLoad(() => salesOrderApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const o = item.data;
  useEffect(() => { if (o) setF(fromOrder(o)); }, [o]);
  const editable = o && o.status === 'DRAFT' && o.createdBy === user.id;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({});
    const p = problem(f, t); if (p) { setErr(p); return; }
    setBusy(true);
    try {
      await salesOrderApi.update(id, toBody(f, { canSetPrice: can('sales_orders.set_price'), canPickSalesperson: can('sales_orders.read_all') }));
      navigate(`/sales-orders/${id}`, { state: { msg: t('edit.updated') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  const statusName = o ? t(`status.${o.status}`, { defaultValue: o.status }).toLocaleLowerCase(currentLocale()) : '';
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('edit.title')}</h1>
          <p className="mt-1 text-sm">{o ? t('edit.subtitle', { orderNo: o.orderNo }) : tc('loading')}</p>
        </div>
        <Link to={`/sales-orders/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('edit.back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}>
          <Banner>{err || item.error}</Banner>
          {o && !editable && <Banner>{t('edit.locked', { status: statusName })}</Banner>}
        </div>
        {editable && (<>
          <SalesOrderForm f={f} setF={setF} fe={fe} />
          <button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('edit.save')}</button>
        </>)}
      </form>
    </div>
  );
}

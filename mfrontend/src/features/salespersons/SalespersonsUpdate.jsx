import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errMsg, fieldErrs, salespersonApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import SalespersonForm, { EMPTY, toBody } from './SalespersonForm.jsx';
import { NOTICE } from './SalespersonsList.jsx';

export default function SalespersonsUpdate() {
  const { t } = useTranslation('salespersons');
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const item = useLoad(() => salespersonApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const s = item.data;
  useEffect(() => {
    if (s) setF({ userId: s.userId || '', fullName: s.fullName, phone: s.phone || '', email: s.email || '', region: s.region || '', warehouseId: s.warehouseId || '',
      commissionRate: String(s.commissionRate ?? 0), monthlyTarget: String(s.monthlyTarget ?? 0) });
  }, [s]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      await salespersonApi.update(id, toBody(f, { canLink: can('users.read'), canPay: can('salespersons.view_commission'), canAssign: can('warehouses.assign'), creating: false }));
      navigate(`/salespersons/${id}`, { state: { msg: t('edit.done') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('edit.title')}</h1>
          <p className="mt-1 text-sm">{s ? `${s.code} · ${s.fullName}` : t('loading', { ns: 'common' })}</p>
        </div>
        <Link to={`/salespersons/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner></div>
        {s && (<><SalespersonForm f={f} setF={setF} fe={fe} selfId={s.id} /><button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('edit.save')}</button></>)}
      </form>
    </div>
  );
}

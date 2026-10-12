import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { customerApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import CustomerForm, { EMPTY, toBody } from './CustomerForm.jsx';
import { NOTICE } from './CustomersList.jsx';

export default function CustomersUpdate() {
  const { t } = useTranslation('customers');
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const item = useLoad(() => customerApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const c = item.data;
  useEffect(() => {
    if (c) setF({ name: c.name, type: c.type, contactPerson: c.contactPerson || '', phone: c.phone || '', email: c.email || '', address: c.address || '',
      city: c.city || '', tin: c.tin || '', creditLimit: String(c.creditLimit ?? 0), paymentTermsDays: String(c.paymentTermsDays ?? 0),
      salespersonId: c.salespersonId || '', notes: c.notes || '' });
  }, [c]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      await customerApi.update(id, toBody(f, can('customers.assign')));
      navigate(`/customers/${id}`, { state: { msg: t('edit.done') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('edit.title')}</h1>
          <p className="mt-1 text-sm">{c ? `${c.code} · ${c.name}` : t('loading', { ns: 'common' })}</p>
        </div>
        <Link to={`/customers/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('back')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner></div>
        {c && (<><CustomerForm f={f} setF={setF} fe={fe} /><button className="btn-primary" disabled={busy}>{busy ? t('saving') : t('edit.save')}</button></>)}
      </form>
    </div>
  );
}

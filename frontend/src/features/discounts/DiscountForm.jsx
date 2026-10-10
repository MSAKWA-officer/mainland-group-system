import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { categoryApi, customerApi, discountApi, errMsg, fieldErrs, itemApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, SCOPE_CODES, todayStr } from './DiscountsList.jsx';

const EMPTY = { name: '', description: '', percent: '', scope: 'ALL', categoryId: '', item: null, customer: null, minQuantity: '0', validFrom: todayStr(), validTo: '' };

// Form -> API body. Only the target that matches the scope is sent; empty text becomes null.
const toBody = (f) => ({
  name: f.name.trim(), description: f.description.trim() || null, percent: Number(f.percent), scope: f.scope,
  categoryId: f.scope === 'CATEGORY' ? f.categoryId || null : null, itemId: f.scope === 'ITEM' ? f.item?.id || null : null,
  customerId: f.customer?.id || null, minQuantity: Number(f.minQuantity || 0), validFrom: f.validFrom || undefined, validTo: f.validTo || null,
});
const loadItems = (s) => itemApi.list({ limit: 25, isActive: 'true', ...(s && { search: s }) }).then((r) => r.data.map((i) => ({ id: i.id, label: `${i.name} (${i.sku})` })));
const loadCustomers = (s) => customerApi.list({ limit: 25, isActive: 'true', ...(s && { search: s }) }).then((r) => r.data.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` })));

// One page for both "New discount" (/discounts/new) and "Edit discount" (/discounts/:id/edit).
export default function DiscountForm() {
  const { t } = useTranslation('discounts');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { can } = useAuth();
  const cur = useLoad(() => (editing ? discountApi.get(id) : Promise.resolve(null)), [id]);
  const cats = useLoad(() => (can('categories.read') ? categoryApi.list({ isActive: 'true', limit: 500 }) : Promise.resolve(null)), []);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const d = cur.data;
  useEffect(() => {
    if (d) setF({ name: d.name, description: d.description || '', percent: String(Number(d.percent)), scope: d.scope, categoryId: d.categoryId || '',
      item: d.item ? { id: d.item.id, label: `${d.item.name} (${d.item.sku})` } : null,
      customer: d.customer ? { id: d.customer.id, label: `${d.customer.name} (${d.customer.code})` } : null,
      minQuantity: String(Number(d.minQuantity)), validFrom: d.validFrom || '', validTo: d.validTo || '' });
  }, [d]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const catList = (cats.data?.data || []);
  const catOpts = d?.category && !catList.some((c) => c.id === d.category.id) ? [d.category, ...catList] : catList;

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      if (editing) { await discountApi.update(id, toBody(f)); navigate(`/discounts/${id}`, { state: { msg: t('form.updated') } }); }
      else { await discountApi.create(toBody(f)); navigate('/discounts', { state: { msg: t('form.created') } }); }
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{editing ? t('form.editTitle') : t('form.newTitle')}</h1>
          <p className="mt-1 text-sm">{editing ? (d ? `${d.code} · ${d.name}` : tc('loading')) : t('form.newSub')}</p>
        </div>
        <Link to={editing ? `/discounts/${id}` : '/discounts'} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{editing ? t('form.back') : t('form.backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || cur.error}</Banner></div>
        {(!editing || d) && (<>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label={t('form.name')} error={fe.name}><input className="input" required minLength={2} maxLength={100} value={f.name} onChange={set('name')} /></Field>
            <Field label={t('form.percent')} error={fe.percent}><input className="input" required type="number" min="0.01" max="100" step="0.01" value={f.percent} onChange={set('percent')} /></Field>
            <div className="sm:col-span-2"><Field label={t('form.description')} error={fe.description}><input className="input" maxLength={255} value={f.description} onChange={set('description')} /></Field></div>
            <Field label={t('form.appliesTo')} error={fe.scope}>
              <select className="input" value={f.scope} onChange={set('scope')}>{SCOPE_CODES.map((k) => <option key={k} value={k}>{t(`scope.${k}`)}</option>)}</select>
            </Field>
            <Field label={t('form.minQty')} error={fe.minQuantity}><input className="input" type="number" min="0" max="1000000" step="0.001" value={f.minQuantity} onChange={set('minQuantity')} /></Field>
            {f.scope === 'CATEGORY' && (
              <div className="sm:col-span-2"><Field label={t('form.category')} error={fe.categoryId}>
                <select className="input" required value={f.categoryId} onChange={set('categoryId')}>
                  <option value="">{t('form.chooseCategory')}</option>{catOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field></div>
            )}
            {f.scope === 'ITEM' && (
              <div className="sm:col-span-2"><Field label={t('form.item')} error={fe.itemId}>
                <Picker value={f.item?.id} selected={f.item} load={loadItems} onPick={(o) => setF({ ...f, item: o })} placeholder={t('form.chooseItem')} required />
              </Field></div>
            )}
            <div className="sm:col-span-2"><Field label={t('form.customer')} error={fe.customerId}>
              <Picker value={f.customer?.id} selected={f.customer} load={loadCustomers} onPick={(o) => setF({ ...f, customer: o })} placeholder={t('form.anyCustomerPlaceholder')} />
            </Field></div>
            <Field label={t('form.validFrom')} error={fe.validFrom}><input className="input" type="date" required value={f.validFrom} onChange={set('validFrom')} /></Field>
            <Field label={t('form.validTo')} error={fe.validTo}><input className="input" type="date" min={f.validFrom || undefined} value={f.validTo} onChange={set('validTo')} /></Field>
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : editing ? t('form.saveChanges') : t('form.saveNew')}</button>
        </>)}
      </form>
    </div>
  );
}

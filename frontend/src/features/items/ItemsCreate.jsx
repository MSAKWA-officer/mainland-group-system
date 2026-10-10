import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { categoryApi, itemApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import useLoad from '../../utils/useLoad';

export default function ItemsCreate() {
  const { t } = useTranslation('items');
  const navigate = useNavigate();
  const { can } = useAuth();
  const cats = useLoad(() => categoryApi.list({ limit: 500, isActive: true }), []);
  const [f, setF] = useState({ sku: '', name: '', barcode: '', categoryId: '', unit: 'pcs', costPrice: '', sellingPrice: '', reorderLevel: '', description: '', trackExpiry: false });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (v) => (v === '' ? undefined : Number(v));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      await itemApi.create({
        sku: f.sku.trim() || undefined, name: f.name.trim(), barcode: f.barcode.trim() || null, categoryId: f.categoryId,
        unit: f.unit.trim() || 'pcs', description: f.description.trim() || null, trackExpiry: f.trackExpiry,
        sellingPrice: num(f.sellingPrice), reorderLevel: num(f.reorderLevel),
        ...(can('items.view_cost') && { costPrice: num(f.costPrice) }),
      });
      navigate('/items', { state: { msg: t('create.done', { name: f.name.trim() }) } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/items" className="text-sm hover:underline">{t('backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6">
        <Banner>{err || cats.error}</Banner>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label={t('fields.itemName')} error={fe.name}><input className="input !text-black" required minLength={2} maxLength={150} value={f.name} onChange={set('name')} /></Field>
          <Field label={t('fields.skuAuto')} error={fe.sku}><input className="input !text-black" maxLength={40} value={f.sku} onChange={set('sku')} /></Field>
          <Field label={t('fields.category')} error={fe.categoryId}>
            <select className="input !text-black" required value={f.categoryId} onChange={set('categoryId')}>
              <option value="">{t('create.selectCategory')}</option>
              {(cats.data?.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('fields.barcode')} error={fe.barcode}><input className="input !text-black" maxLength={60} value={f.barcode} onChange={set('barcode')} /></Field>
          <Field label={t('fields.unitHint')} error={fe.unit}><input className="input !text-black" required maxLength={20} value={f.unit} onChange={set('unit')} /></Field>
          <Field label={t('fields.reorder')} error={fe.reorderLevel}><input className="input !text-black" type="number" min="0" step="0.001" value={f.reorderLevel} onChange={set('reorderLevel')} /></Field>
          {can('items.view_cost') && <Field label={t('fields.costPrice')} error={fe.costPrice}><input className="input !text-black" type="number" min="0" step="0.01" value={f.costPrice} onChange={set('costPrice')} /></Field>}
          <Field label={t('fields.sellingPrice')} error={fe.sellingPrice}><input className="input !text-black" type="number" min="0" step="0.01" value={f.sellingPrice} onChange={set('sellingPrice')} /></Field>
          <div className="sm:col-span-2"><Field label={t('fields.description')} error={fe.description}><textarea className="input !text-black" rows={3} maxLength={2000} value={f.description} onChange={set('description')} /></Field></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.trackExpiry} onChange={(e) => setF({ ...f, trackExpiry: e.target.checked })} />
            {t('create.trackExpiryLabel')}
          </label>
          <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || cats.loading}>{busy ? t('saving') : t('create.save')}</button></div>
        </div>
      </form>
    </div>
  );
}

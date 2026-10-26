import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { efdDeviceApi, efdReceiptApi, errMsg, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import Picker from '../../components/Picker.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, money } from './EfdReceiptsList.jsx';

const asOption = (o) => ({ id: o.id, label: `${o.saleNo} · ${o.customerName || 'Walk-in'} · ${money(o.total)}`, total: o.total, saleNo: o.saleNo });
// Only COMPLETED cash / credit sales without an EFD number are offered; the server checks this again.
const loadSales = (s) => efdReceiptApi.eligibleSales(s ? { search: s } : {}).then((r) => r.data.map(asOption));

export default function EfdReceiptsCreate() {
  const { t } = useTranslation('efd');
  const navigate = useNavigate();
  const [params] = useSearchParams();                    // /efd-receipts/new?saleId=… pre-selects the sale
  const devs = useLoad(() => efdDeviceApi.list({ isActive: 'true', limit: 100 }), []);
  const [f, setF] = useState({ deviceId: '', sale: null, receiptNo: '', verificationCode: '', issuedAt: '' });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const preId = params.get('saleId');
  useEffect(() => { if (preId) efdReceiptApi.eligibleSales({ id: preId }).then((r) => r.data[0] && setF((p) => ({ ...p, sale: asOption(r.data[0]) }))).catch(() => {}); }, [preId]);
  const devices = devs.data?.data || [];
  useEffect(() => { if (devices.length === 1) setF((p) => (p.deviceId ? p : { ...p, deviceId: devices[0].id })); }, [devices.length]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try {
      const r = await efdReceiptApi.create({ deviceId: f.deviceId, saleId: f.sale.id, receiptNo: f.receiptNo.trim(),
        verificationCode: f.verificationCode.trim() || null, ...(f.issuedAt && { issuedAt: new Date(f.issuedAt).toISOString() }) });
      navigate(`/efd-receipts/${r.id}`, { state: { msg: t('receipt.create.saved') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('receipt.create.title')}</h1>
          <p className="mt-1 text-sm">{t('receipt.create.intro')}</p>
        </div>
        <Link to="/efd-receipts" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('shared.backToList')}</Link>
      </div>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || devs.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label={t('receipt.create.order')} error={fe.saleId}>
            <Picker value={f.sale?.id} selected={f.sale} load={loadSales} onPick={(o) => setF({ ...f, sale: o })} placeholder={t('receipt.create.orderPlaceholder')} required />
          </Field></div>
          <div className="sm:col-span-2"><Field label={t('shared.device')} error={fe.deviceId}>
            <select className="input" required value={f.deviceId} onChange={set('deviceId')}>
              <option value="">{t('shared.chooseDevice')}</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.serialNo})</option>)}
            </select>
          </Field></div>
          <Field label={t('receipt.create.receiptNo')} error={fe.receiptNo}><input className="input" required maxLength={40} pattern="[A-Za-z0-9\-]+" title={t('receipt.create.receiptNoTitle')} value={f.receiptNo} onChange={set('receiptNo')} /></Field>
          <Field label={t('receipt.create.verification')} error={fe.verificationCode}><input className="input" maxLength={40} pattern="[A-Za-z0-9\-]*" title={t('receipt.create.receiptNoTitle')} value={f.verificationCode} onChange={set('verificationCode')} /></Field>
          <div className="sm:col-span-2"><Field label={t('receipt.create.issuedAt')} error={fe.issuedAt}>
            <input className="input max-w-xs" type="datetime-local" value={f.issuedAt} onChange={set('issuedAt')} />
          </Field></div>
          {f.sale && <p className="text-sm sm:col-span-2">{t('receipt.create.orderTotal')} <b>{money(f.sale.total)}</b></p>}
        </div>
        <button className="btn-primary" disabled={busy || !f.sale}>{busy ? t('shared.saving') : t('receipt.create.submit')}</button>
      </form>
    </div>
  );
}

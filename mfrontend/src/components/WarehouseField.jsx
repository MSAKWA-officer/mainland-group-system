import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { warehouseApi } from '../api/index.js';
import useLoad from '../utils/useLoad';
import Field from './Field.jsx';

// The "Warehouse" box for stock documents (adjustment, damaged, expired, reject in / out).
// Lists only the warehouses this user may work in (a storekeeper: the ones he is in charge of). A single one is chosen automatically.
// `head.warehouseId` holds the choice; the API refuses a warehouse the user is not in charge of, and a warehouse that does not hold enough stock.
export default function WarehouseField({ head, setHead, fe = {} }) {
  const { t } = useTranslation('common');
  const wh = useLoad(() => warehouseApi.options(), []);
  useEffect(() => {
    if (wh.data && !head.warehouseId && wh.data.length === 1) setHead({ ...head, warehouseId: wh.data[0].id });
  }, [wh.data]); // eslint-disable-line
  return (
    <Field label={t('warehouseField.label')} error={fe.warehouseId}>
      <select className="input !text-black" required value={head.warehouseId || ''} onChange={(e) => setHead({ ...head, warehouseId: e.target.value })}>
        <option value="">{t('warehouseField.select')}</option>
        {(wh.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
      </select>
      {wh.data && wh.data.length === 0 && <p className="mt-1 text-xs">{t('warehouseField.none')}</p>}
    </Field>
  );
}

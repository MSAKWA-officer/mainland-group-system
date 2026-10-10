import { useTranslation } from 'react-i18next';
import { creditSaleApi } from '../../api/index.js';
import useLoad from '../../utils/useLoad';
import { money } from '../sales/saleUi.jsx';

// Shows a customer's credit position. `total` (optional) is the sale being made: warns when it does not fit in the available credit.
export default function CreditStatus({ customerId, total }) {
  const { t } = useTranslation('saleForm');
  const q = useLoad(() => (customerId ? creditSaleApi.creditStatus(customerId) : Promise.resolve(null)), [customerId]);
  const s = q.data;
  if (!customerId || !s) return q.error ? <p className="text-xs text-black">{q.error}</p> : null;
  const available = Number(s.available);
  const over = total != null && Number(total) > available;
  return (
    <div className="rounded-md border border-line p-3 text-sm text-black">
      <div className="grid gap-2 sm:grid-cols-4">
        <div><div className="text-xs uppercase">{t('credit.limit')}</div><b>{money(s.creditLimit)}</b></div>
        <div><div className="text-xs uppercase">{t('credit.outstanding')}</div><b>{money(s.outstanding)}</b></div>
        <div><div className="text-xs uppercase">{t('credit.available')}</div><b>{money(s.available)}</b></div>
        <div><div className="text-xs uppercase">{t('credit.overdue')}</div><b className={Number(s.overdue) > 0 ? 'text-red-600' : ''}>{money(s.overdue)}</b></div>
      </div>
      {Number(s.creditLimit) <= 0 && <p className="mt-2 text-xs font-semibold text-red-600">{t('credit.noLimit')}</p>}
      {over && Number(s.creditLimit) > 0 && <p className="mt-2 text-xs font-semibold text-red-600">{t('credit.overLimit', { total: money(total), available: money(s.available) })}</p>}
      {Number(s.overdue) > 0 && <p className="mt-2 text-xs font-semibold text-red-600">{t('credit.hasOverdue')}</p>}
      <p className="mt-1 text-xs">{t('credit.terms', { count: s.paymentTermsDays })}</p>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { money } from '../banking/bankingUi.jsx';

// Same exports as before (EfdReports and EfdDifferences import from here).
export { NOTICE, PageHead, Row, Stat, day, money, askReason } from '../banking/bankingUi.jsx';

// Status code -> dot colour. The label comes from locales/<lang>/efd.json (recon.status.<CODE>).
export const STATUS_DOT = { OPEN: 'bg-amber-500', RECONCILED: 'bg-emerald-600', VOIDED: 'bg-slate-400' };

// Status as black text with a coloured dot (same look as the other screens).
export const Status = ({ status }) => {
  const { t } = useTranslation('efd');
  const dot = STATUS_DOT[status] || 'bg-slate-400';
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{t(`recon.status.${status}`, { defaultValue: status })}</span>;
};

// The trading day is judged in the business time zone, so "today" must be too (the server refuses future days).
export const tzToday = () => {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Dar_es_Salaam' }); }
  catch { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
};

// Same rule as the server: any variance, or any confirmed order without an EFD receipt, counts as a difference.
export const hasDiff = (f) => !!f && (Number(f.grossVariance) !== 0 || Number(f.vatVariance) !== 0 || Number(f.countVariance) !== 0 || Number(f.unreceiptedOrdersCount) > 0);

// A variance of 0 is fine; anything else is red so it is noticed. Variance = Z report minus system.
export const Variance = ({ v, count }) => {
  const n = Number(v || 0);
  if (n === 0) return <span className="text-black">0</span>;
  return <span className="font-semibold text-red-600">{n < 0 ? '−' : '+'}{count ? Math.abs(n) : money(Math.abs(n))}</span>;
};

// Z report vs system. `f` is either a saved reconciliation or the `figures` of a preview (same field names).
export function FiguresTable({ f }) {
  const { t } = useTranslation('efd');
  const cell = 'td px-4 text-right text-black';
  const heads = ['', t('recon.figures.zReport'), t('recon.figures.system'), t('recon.figures.difference')];
  return (
    <div className="max-w-3xl overflow-x-auto rounded-md border border-line">
      <table className="w-full">
        <thead className="bg-slate-50"><tr>{heads.map((h, i) => <th key={i} className={`th px-4 py-2 font-normal uppercase text-black ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>
          <tr><td className="td px-4 text-black">{t('recon.figures.receipts')}</td><td className={cell}>{f.zCount}</td><td className={cell}>{f.receiptsCount}</td><td className="td px-4 text-right"><Variance v={f.countVariance} count /></td></tr>
          <tr><td className="td px-4 text-black">{t('recon.figures.gross')}</td><td className={cell}>{money(f.zGross)}</td><td className={cell}>{money(f.receiptsGross)}</td><td className="td px-4 text-right"><Variance v={f.grossVariance} /></td></tr>
          <tr><td className="td px-4 text-black">{t('recon.figures.vat')}</td><td className={cell}>{money(f.zVat)}</td><td className={cell}>{money(f.receiptsVat)}</td><td className="td px-4 text-right"><Variance v={f.vatVariance} /></td></tr>
          <tr><td className="td px-4 text-black">{t('recon.figures.voidedSystem')}</td><td className={cell}>—</td><td className={cell}>{f.voidedReceiptsCount}{f.voidedReceiptsAmount != null ? ` · ${money(f.voidedReceiptsAmount)}` : ''}</td><td className={cell}>—</td></tr>
          <tr>
            <td className="td px-4 text-black">{t('recon.figures.unreceipted')}</td><td className={cell}>—</td>
            <td className={cell}>{f.unreceiptedOrdersCount} · {money(f.unreceiptedOrdersAmount)}</td>
            <td className="td px-4 text-right">{Number(f.unreceiptedOrdersCount) > 0 ? <span className="font-semibold text-red-600">{f.unreceiptedOrdersCount}</span> : <span className="text-black">0</span>}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

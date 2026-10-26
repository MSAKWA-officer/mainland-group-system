import { saleLink, saleCan } from '../../utils/saleLink.js';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Variance, day, money } from '../efdReconciliations/reconUi.jsx';

export const MAX_DAYS = 92;
export const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'];
export const SEV_DOT = { HIGH: 'bg-red-500', MEDIUM: 'bg-amber-500', LOW: 'bg-slate-400' };
export const COUNTS = ['receiptsCount', 'missingCount'];       // plain numbers
export const MONEY = ['grossAmount', 'vatAmount'];             // shown as money

export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const span = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
export const viewPath = (x) => `/efd-differences/view?key=${encodeURIComponent(x.key)}`;

// Severity as black text with a coloured dot.
export const Sev = ({ s }) => {
  const { t } = useTranslation('efdDifferences');
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${SEV_DOT[s] || 'bg-slate-400'}`} />{t(`severity.${s}`, { defaultValue: s })}</span>;
};

// The server sends English text (typeLabel, message). The type code and the figures are language-neutral,
// so the wording is rebuilt here from them. An unknown type falls back to the server's text.
export const typeLabel = (x, t) => t(`types.${x.type}`, { defaultValue: x.typeLabel || x.type });

export const findingMessage = (x, t) => {
  const r = x.refs || {};
  const base = { serial: x.deviceSerial, date: day(x.date) };
  const missing = x.difference?.missingCount;
  switch (x.type) {
    case 'Z_MISSING': return t('messages.Z_MISSING', base);
    case 'Z_MISMATCH': return t('messages.Z_MISMATCH', { ...base, report: r.reportNo });
    case 'Z_NUMBER_GAP': return t('messages.Z_NUMBER_GAP', { ...base, prev: String(Number(x.expected?.zNumber) - 1), z: x.actual?.zNumber, missing });
    case 'UNRECEIPTED_ORDER': {
      const customer = /^Sale \S+ \((.*)\) was completed on /.exec(x.message || '')?.[1];   // only the server text carries the customer name
      return customer ? t('messages.UNRECEIPTED_ORDER', { ...base, order: r.saleNo, customer }) : t('messages.UNRECEIPTED_ORDER_NO_CUSTOMER', { ...base, order: r.saleNo });
    }
    case 'RECEIPT_AMOUNT_MISMATCH': return t('messages.RECEIPT_AMOUNT_MISMATCH', { ...base, receipt: r.receiptNo, order: r.saleNo });
    case 'RECEIPT_NUMBER_GAP': return t('messages.RECEIPT_NUMBER_GAP', { ...base, prev: x.expected?.receiptNo, receipt: x.actual?.receiptNo, missing });
    case 'RECON_MISSING': return t('messages.RECON_MISSING', { ...base, report: r.reportNo });
    case 'Z_PENDING_OLD': return t('messages.Z_PENDING_OLD', { ...base, report: r.reportNo, days: x.ageDays });
    case 'RECON_DRIFT': return t('messages.RECON_DRIFT', { ...base, recon: r.reconNo });
    default: return x.message;
  }
};

export const factLabel = (k, t) => t(`facts.${k}`, { defaultValue: k });
export const factValue = (k, v) => (MONEY.includes(k) ? money(v) : v);

// What the records say (expected) or what was found (actual): "Receipts 3 · Gross 1,234.00".
export const Facts = ({ v }) => {
  const { t } = useTranslation('efdDifferences');
  const parts = v ? Object.entries(v).filter(([, x]) => x !== null && x !== undefined && x !== '') : [];
  if (!parts.length) return <span>—</span>;
  return <>{parts.map(([k, x]) => <div key={k} className="whitespace-nowrap">{factLabel(k, t)} <b>{factValue(k, x)}</b></div>)}</>;
};

// Signed differences, red when not zero.
export const Gap = ({ v }) => {
  const { t } = useTranslation('efdDifferences');
  if (!v) return <span>—</span>;
  return <>{Object.entries(v).map(([k, x]) => (
    <div key={k} className="whitespace-nowrap">{factLabel(k, t)} {k === 'missingCount' ? <b className="text-red-600">{x}</b> : <Variance v={x} count={COUNTS.includes(k)} />}</div>
  ))}</>;
};

// Where to go next for one finding. Only links the user may open are shown.
export function Next({ x }) {
  const { t } = useTranslation('efdDifferences');
  const { can } = useAuth();
  const L = ({ to, children }) => <Link to={to} className="whitespace-nowrap text-black underline">{children}</Link>;
  const r = x.refs || {};
  const links = [];
  if (r.zReportId && can('efd_z_reports.read')) links.push(<L key="z" to={`/efd-z-reports/${r.zReportId}`}>{t('links.zReport', { no: r.reportNo })}</L>);
  if (r.reconId && can('efd_reconciliations.read')) links.push(<L key="c" to={`/efd-reconciliations/${r.reconId}`}>{r.reconNo}</L>);
  if (r.receiptId && can('efd_receipts.read')) links.push(<L key="r" to={`/efd-receipts/${r.receiptId}`}>{t('links.receipt', { no: r.receiptNo })}</L>);
  if (r.saleId && saleCan(can, r.saleType)) links.push(<L key="o" to={saleLink(r.saleId, r.saleType)}>{t('links.order', { no: r.saleNo })}</L>);
  if (r.saleId && x.type === 'UNRECEIPTED_ORDER' && can('efd_receipts.create')) links.push(<L key="n" to={`/efd-receipts/new?saleId=${r.saleId}`}>{t('links.recordEfd')}</L>);
  if (x.type === 'Z_MISSING' && x.deviceId && can('efd_z_reports.create')) links.push(<L key="zn" to={`/efd-z-reports/new?deviceId=${x.deviceId}`}>{t('links.recordZ')}</L>);
  if (x.type === 'RECON_MISSING' && x.deviceId && can('efd_reconciliations.create')) links.push(<L key="rn" to={`/efd-reconciliations/new?deviceId=${x.deviceId}&date=${x.date}`}>{t('links.startRecon')}</L>);
  if (!links.length) return <span>—</span>;
  return <div className="flex flex-col gap-1 text-sm">{links}</div>;
}

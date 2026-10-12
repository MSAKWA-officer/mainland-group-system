// Small display pieces and helpers shared by Bank transactions, Customer payments, Expenses and Payments.
import { bankAccountApi } from '../../api/index.js';
import useLoad from '../../utils/useLoad';

export { NOTICE, METHOD, money, day } from '../sales/saleUi.jsx';
export { Row, Stat, PagerBar, today } from '../customerReports/reportUi.jsx';
export { IconBtn, TONES } from '../banks/BanksList.jsx';

export const TXN_LABEL = { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', TRANSFER_IN: 'Transfer in', TRANSFER_OUT: 'Transfer out', CHARGE: 'Charge', INTEREST: 'Interest', CUSTOMER_PAYMENT: 'Customer payment' };
export const MANUAL_TYPES = { DEPOSIT: 'Deposit (money in)', WITHDRAWAL: 'Withdrawal (money out)', CHARGE: 'Bank charge (money out)', INTEREST: 'Interest (money in)' };
export const CATEGORY = { RENT: 'Rent', UTILITIES: 'Utilities', SALARIES: 'Salaries', TRANSPORT: 'Transport', FUEL: 'Fuel', MARKETING: 'Marketing', MAINTENANCE: 'Maintenance',
  OFFICE: 'Office', TAXES: 'Taxes', BANK_CHARGES: 'Bank charges', OTHER: 'Other' };
export const NEEDS_BANK = ['BANK', 'CHEQUE', 'CARD'];

// Status as black text with a coloured dot (same look as the Sales screens).
const DOTS = {
  POSTED: ['Posted', 'bg-emerald-600'], VOIDED: ['Voided', 'bg-red-500'], ACTIVE: ['Active', 'bg-emerald-600'],
  PENDING: ['Waiting for approval', 'bg-amber-500'], APPROVED: ['Approved', 'bg-emerald-600'], REJECTED: ['Rejected', 'bg-red-500'],
  UNPAID: ['Unpaid', 'bg-red-500'], PARTIAL: ['Part paid', 'bg-amber-500'], PAID: ['Paid', 'bg-emerald-600'],
};
export const Dot = ({ value }) => {
  const [label, dot] = DOTS[value] || [value, 'bg-slate-400'];
  return <span className="inline-flex items-center gap-2 text-black"><span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{label}</span>;
};

// Money as whole cents (integers), so sums and comparisons never drift.
export const toCents = (v) => Math.round(Number(v || 0) * 100);
export const fromCents = (c) => (c / 100).toFixed(2);

// Asks for a reason (at least 3 characters). Returns the trimmed reason, or null when cancelled or too short.
export const askReason = (message) => {
  const r = window.prompt(message);
  return r && r.trim().length >= 3 ? r.trim() : null;
};

export const accountLabel = (a) => (a ? `${a.bank?.name ? `${a.bank.name} · ` : ''}${a.accountNo} (${a.accountName})` : '—');

// Active bank accounts for a drop-down. Pass `currency` to list only accounts in that currency.
export const useAccounts = (currency) => useLoad(() => bankAccountApi.list({ limit: 100, isActive: 'true', ...(currency && { currency }) }), [currency]);

export function AccountSelect({ accounts, value, onChange, required, placeholder = 'Select an account…', disabled }) {
  return (
    <select className="input" required={required} disabled={disabled} value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {(accounts || []).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} · {a.currency}</option>)}
    </select>
  );
}

// "Back to list" style page header used by every Create / Update screen.
export const PageHead = ({ title, sub, children }) => (
  <div className="flex items-center justify-between gap-3 p-6">
    <div><h1 className="text-2xl font-semibold">{title}</h1>{sub && <p className="mt-1 text-sm">{sub}</p>}</div>
    {children}
  </div>
);

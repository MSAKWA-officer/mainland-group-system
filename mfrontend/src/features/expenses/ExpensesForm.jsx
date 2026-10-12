import { useTranslation } from 'react-i18next';
import Field from '../../components/Field.jsx';
import { today } from '../banking/bankingUi.jsx';

// Category codes (the labels come from locales/<lang>/expenses.json -> category.<CODE>).
export const CATEGORY_CODES = ['RENT', 'UTILITIES', 'SALARIES', 'TRANSPORT', 'FUEL', 'MARKETING', 'MAINTENANCE', 'OFFICE', 'TAXES', 'BANK_CHARGES', 'OTHER'];

export const EMPTY = { category: 'OTHER', description: '', payee: '', reference: '', amount: '', expenseDate: today(), notes: '' };

// Form state -> request body (blank optional fields become null so an edit can clear them).
export const toBody = (f) => ({
  category: f.category, description: f.description.trim(), payee: f.payee.trim() || null, reference: f.reference.trim() || null,
  amount: Number(f.amount), expenseDate: f.expenseDate || undefined, notes: f.notes.trim() || null,
});

// Saved expense (from the API) -> form state.
export const fromExpense = (e) => ({ category: e.category, description: e.description, payee: e.payee || '', reference: e.reference || '', amount: String(Number(e.amount)),
  expenseDate: e.expenseDate || today(), notes: e.notes || '' });

// Shared by ExpensesCreate and ExpensesUpdate.
export default function ExpensesForm({ f, setF, fe }) {
  const { t } = useTranslation('expenses');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t('form.category')} error={fe.category}>
        <select className="input" value={f.category} onChange={set('category')}>{CATEGORY_CODES.map((k) => <option key={k} value={k}>{t(`category.${k}`)}</option>)}</select>
      </Field>
      <Field label={t('form.amount')} error={fe.amount}><input className="input" type="number" required min="0.01" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
      <div className="sm:col-span-2">
        <Field label={t('form.description')} error={fe.description}><input className="input" required minLength={3} maxLength={255} placeholder={t('form.descriptionPlaceholder')} value={f.description} onChange={set('description')} /></Field>
      </div>
      <Field label={t('form.payee')} error={fe.payee}><input className="input" maxLength={150} placeholder={t('form.payeePlaceholder')} value={f.payee} onChange={set('payee')} /></Field>
      <Field label={t('form.reference')} error={fe.reference}><input className="input" maxLength={100} value={f.reference} onChange={set('reference')} /></Field>
      <Field label={t('form.expenseDate')} error={fe.expenseDate}><input className="input" type="date" required max={today()} value={f.expenseDate} onChange={set('expenseDate')} /></Field>
      <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><textarea className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} /></Field></div>
    </div>
  );
}

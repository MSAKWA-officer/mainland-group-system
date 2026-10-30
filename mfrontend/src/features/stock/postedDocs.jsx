import { useTranslation } from 'react-i18next';
import { errMsg } from '../../api/index.js';
import Field from '../../components/Field.jsx';

// Delete / edit of a document that is already POSTED to stock (receiving, adjustment, reject in / out, damaged, expired write-off).
//   Delete = REVERSE: the stock goes back through opposite ledger rows; the document stays as "Voided" with who / when / why.
//   Edit   = CORRECTION: the old document is reversed and the corrected one is posted, in one step (nothing changes if either part fails).
// The API enforces who may do it (the creator, a Manager who approves this document type, or the Owner) and refuses it when the stock was already used.
export const canCorrectDoc = (d, user, can, module) =>
  d?.status === 'POSTED' && can(`${module}.create`) && (d.createdBy === user.id || can(`${module}.approve`) || user.role === 'OWNER');

// Returns reverse(d): asks for the reason, calls api.reverse(id, { reason }) and refreshes. Errors (e.g. "stock already used") go to onError.
export function useReversePosted({ api, onChanged, onError, askReason = true }) {
  const { t } = useTranslation('correction');
  return async (d) => {
    let reason;
    if (askReason) {
      reason = window.prompt(t('reversePrompt', { docNo: d.docNo || d.transferNo || d.saleNo }));
      if (reason === null) return;
      if (reason.trim().length < 3) { onError(t('reasonRequired')); return; }
    } else {                                                 // one click + confirm: the reason is recorded automatically in the audit trail
      if (!window.confirm(t('deleteConfirm', { docNo: d.docNo, defaultValue: `Delete ${d.docNo}? The stock it added will be removed from the warehouse.` }))) return;
      reason = 'Deleted by user';
    }
    onError('');
    try { await api.reverse(d.id, { reason: reason.trim() }); onChanged?.(); } catch (x) { onError(errMsg(x)); }
  };
}

// Shown on the edit page of a POSTED document: explains what saving does and asks why it is being changed.
export function CorrectionReason({ value, onChange, error, text }) {
  const { t } = useTranslation('correction');
  return (
    <div className="max-w-3xl space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-black">
      <p>{text || t('postedNotice')}</p>
      <Field label={t('changeReason')} error={error}>
        <textarea className="input !text-black" rows={2} required minLength={3} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    </div>
  );
}

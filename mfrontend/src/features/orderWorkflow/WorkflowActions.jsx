import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errMsg, fieldErrs, orderWorkflowApi, salesOrderApi } from '../../api/index.js';

// One entry per button. `note`: 'required' | 'optional'. The API decides which buttons this user gets (wf.actions).
// Maandishi (label, go, text, done) yanatoka orderWorkflow.json -> actions.<key>.*
const ACTIONS = [
  { key: 'storekeeperVerify', cls: 'btn-primary', call: orderWorkflowApi.storekeeperVerify, note: 'optional' },
  { key: 'storekeeperReturn', cls: 'btn-ghost', call: orderWorkflowApi.storekeeperReturn, note: 'required' },
  { key: 'managerApprove', cls: 'btn-primary', call: orderWorkflowApi.managerApprove, note: 'optional' },
  { key: 'managerReject', cls: 'btn-danger', call: orderWorkflowApi.managerReject, note: 'required' },
  { key: 'managerReturn', cls: 'btn-ghost', call: orderWorkflowApi.managerReturn, note: 'required' },
  { key: 'acknowledge', cls: 'btn-primary', call: orderWorkflowApi.acknowledge, note: 'optional' },
];

function NoteDialog({ action, wf, onClose, onDone }) {
  const { t } = useTranslation('orderWorkflow');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [details, setDetails] = useState([]);
  const box = useRef(null);
  const required = action.note === 'required';
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);
  const submit = async (e) => {
    e.preventDefault();
    if (required && note.trim().length < 3) { setErr(t('dialog.reasonMin')); return; }
    setBusy(true); setErr(''); setDetails([]);
    try { await action.call(wf.id, note.trim() || undefined); onDone(t(`actions.${action.key}.done`)); }
    catch (x) { setErr(errMsg(x)); setDetails(Object.values(fieldErrs(x))); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="wf-dialog-title" className="panel w-full max-w-md p-5 text-black shadow-lg">
        <h2 id="wf-dialog-title" className="text-lg font-semibold">{t(`actions.${action.key}.label`)} · {wf.order?.orderNo}</h2>
        <p className="mt-1 text-sm">{t(`actions.${action.key}.text`)}</p>
        <label htmlFor="wf-note" className="label mt-4">{required ? t('dialog.reasonRequired') : t('dialog.noteOptional')}</label>
        <textarea id="wf-note" ref={box} className="input min-h-[6rem]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {err && (
          <div role="alert" className="mt-3 rounded-md border border-danger/30 bg-red-50 px-3 py-2 text-sm text-black">
            {err}
            {details.length > 0 && <ul className="mt-1 list-disc pl-5">{details.map((d) => <li key={d}>{d}</li>)}</ul>}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>{t('dialog.cancel')}</button>
          <button type="submit" className={action.cls === 'btn-ghost' ? 'btn-primary' : action.cls} disabled={busy}>{busy ? t('dialog.working') : t(`actions.${action.key}.go`)}</button>
        </div>
      </form>
    </div>
  );
}

// The buttons the current user may press right now. onDone(message) is called after a successful step.
export default function WorkflowActions({ wf, onDone, onError }) {
  const { t } = useTranslation('orderWorkflow');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const a = wf.actions || {};
  const resubmit = async () => {
    if (!window.confirm(t('resubmit.confirm', { orderNo: wf.order?.orderNo }))) return;
    setBusy(true); onError('');
    try { await salesOrderApi.submit(wf.orderId); onDone(t('resubmit.done')); }
    catch (x) { onError(errMsg(x)); setBusy(false); }
  };
  const shown = ACTIONS.filter((x) => a[x.key]);
  if (!shown.length && !a.editAndResubmit) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((x) => <button key={x.key} type="button" className={x.cls} onClick={() => setOpen(x)}>{t(`actions.${x.key}.label`)}</button>)}
      {a.editAndResubmit && <>
        <Link to={`/sales-orders/${wf.orderId}/edit`} className="btn-ghost">{t('resubmit.editOrder')}</Link>
        <button type="button" className="btn-primary" disabled={busy} onClick={resubmit}>{t('resubmit.submitAgain')}</button>
      </>}
      {open && <NoteDialog action={open} wf={wf} onClose={() => setOpen(null)} onDone={(m) => { setOpen(null); onDone(m); }} />}
    </div>
  );
}

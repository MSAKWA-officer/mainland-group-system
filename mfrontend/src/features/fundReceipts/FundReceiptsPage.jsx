import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fundReceiptApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { BanIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { AccountSelect, IconBtn, NOTICE, TONES, askReason, day, money, today, useAccounts } from '../banking/bankingUi.jsx';

const SOURCES = ['OWNER_CAPITAL', 'HEAD_OFFICE', 'LOAN', 'GRANT', 'OTHER'];
const PURPOSES = ['FUEL', 'EXPENSES', 'OTHER'];
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const COLS = ['receiptNo', 'date', 'account', 'receivedFrom', 'source', 'purpose', 'amount', 'status', 'actions'];
const BLANK = { bankAccountId: '', source: 'OWNER_CAPITAL', receivedFrom: '', purpose: 'FUEL', amount: '', receiptDate: today(), reference: '', notes: '' };

// Receive money into a bank account for a purpose (fuel, expenses, other). Each receipt posts a DEPOSIT to the bank ledger; voiding it voids that row too.
export default function FundReceiptsPage() {
  const { t } = useTranslation('fundReceipts');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const accounts = useAccounts('TZS');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [q, setQ] = useState('');
  const [f, setF] = useState({ bankAccountId: '', source: '', purpose: '', status: 'ALL', from: '', to: '' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [open, setOpen] = useState(false); const [form, setForm] = useState(BLANK); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { const t0 = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t0); }, [search]);
  const range = { ...(f.from && { from: f.from }), ...(f.to && { to: f.to }) };
  const list = useLoad(() => fundReceiptApi.list({ page, limit: 25, ...(q && { search: q }), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [page, q, f]);
  const sum = useLoad(() => fundReceiptApi.summary({ groupBy: 'purpose', ...range }), [f.from, f.to, list.data]);
  const rows = list.data?.data || []; const total = list.data?.total || 0; const limit = list.data?.limit || 25;
  const setFilter = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const acc = (accounts.data?.data || []).find((a) => a.id === form.bankAccountId);
  const byPurpose = Object.fromEntries((sum.data?.rows || []).map((r) => [r.label, r.total]));

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setOk(''); setFe({});
    if (!(Number(form.amount) > 0)) { setFe({ amount: t('form.amountError') }); return; }
    setBusy(true);
    try {
      const r = await fundReceiptApi.create({ bankAccountId: form.bankAccountId, source: form.source, receivedFrom: form.receivedFrom.trim(), purpose: form.purpose,
        amount: Number(form.amount), receiptDate: form.receiptDate || undefined, reference: form.reference.trim() || null, notes: form.notes.trim() || null });
      setOk(t('form.saved', { no: r.receiptNo })); setForm(BLANK); setOpen(false); setPage(1); list.reload();
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); }
    setBusy(false);
  };
  const voidIt = async (r) => {
    const reason = askReason(t('actions.voidPrompt', { no: r.receiptNo }));
    if (!reason) return;
    setErr(''); setOk('');
    try { await fundReceiptApi.voidReceipt(r.id, reason); setOk(t('actions.voided')); list.reload(); } catch (x) { setErr(errMsg(x)); }
  };
  const filtered = q || Object.entries(f).some(([k, v]) => v && !(k === 'status' && v === 'ALL'));

  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
        </div>
        {can('fund_receipts.create') && <button type="button" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold" onClick={() => setOpen(!open)}><PlusIcon />{open ? t('form.cancel') : t('new')}</button>}
      </div>

      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-4">
        <div className="rounded-md border border-line p-3"><div className="text-xs uppercase">{t('stats.total')}</div><div className="mt-1 text-xl font-semibold">{money(sum.data?.total || 0)}</div></div>
        {PURPOSES.map((p) => <div key={p} className="rounded-md border border-line p-3"><div className="text-xs uppercase">{t(`purpose.${p}`)}</div><div className="mt-1 text-xl font-semibold">{money(byPurpose[p] || 0)}</div></div>)}
      </div>

      {open && (
        <form onSubmit={submit} className="space-y-4 border-t border-line px-4 py-4 [&_.text-danger]:!text-black">
          <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('form.account')} error={fe.bankAccountId}><AccountSelect required accounts={accounts.data?.data} value={form.bankAccountId} onChange={set('bankAccountId')} placeholder={t('form.selectAccount')} /></Field>
            </div>
            <Field label={t('form.source')} error={fe.source}><select className="input" value={form.source} onChange={set('source')}>{SOURCES.map((k) => <option key={k} value={k}>{t(`source.${k}`)}</option>)}</select></Field>
            <Field label={t('form.receivedFrom')} error={fe.receivedFrom}><input className="input" required maxLength={150} placeholder={t('form.receivedFromPlaceholder')} value={form.receivedFrom} onChange={set('receivedFrom')} /></Field>
            <Field label={t('form.purpose')} error={fe.purpose}><select className="input" value={form.purpose} onChange={set('purpose')}>{PURPOSES.map((k) => <option key={k} value={k}>{t(`purpose.${k}`)}</option>)}</select></Field>
            <Field label={acc ? t('form.amountCur', { currency: acc.currency }) : t('form.amount')} error={fe.amount}><input className="input" type="number" required min="0.01" step="0.01" value={form.amount} onChange={set('amount')} /></Field>
            <Field label={t('form.date')} error={fe.receiptDate}><input className="input" type="date" required min={acc?.openingDate || undefined} max={today()} value={form.receiptDate} onChange={set('receiptDate')} /></Field>
            <Field label={t('form.reference')} error={fe.reference}><input className="input" maxLength={100} value={form.reference} onChange={set('reference')} /></Field>
            <div className="sm:col-span-2"><Field label={t('form.notes')} error={fe.notes}><input className="input" maxLength={1000} value={form.notes} onChange={set('notes')} /></Field></div>
          </div>
          <p className="text-xs">{t('form.hint')}</p>
          <button className="btn-primary" disabled={busy}>{busy ? t('form.saving') : t('form.submit')}</button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-4">
        <input className="input max-w-xs !text-[14px] !text-[#212121]" placeholder={t('list.search')} aria-label={t('list.search')} value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-w-[16rem] flex-1"><AccountSelect accounts={accounts.data?.data} value={f.bankAccountId} onChange={setFilter('bankAccountId')} placeholder={t('list.allAccounts')} /></div>
        <select className="input max-w-[11rem] !text-[14px] !text-[#212121]" aria-label={t('list.allPurposes')} value={f.purpose} onChange={setFilter('purpose')}><option value="">{t('list.allPurposes')}</option>{PURPOSES.map((k) => <option key={k} value={k}>{t(`purpose.${k}`)}</option>)}</select>
        <select className="input max-w-[12rem] !text-[14px] !text-[#212121]" aria-label={t('list.allSources')} value={f.source} onChange={setFilter('source')}><option value="">{t('list.allSources')}</option>{SOURCES.map((k) => <option key={k} value={k}>{t(`source.${k}`)}</option>)}</select>
        <select className="input max-w-[9rem] !text-[14px] !text-[#212121]" aria-label={t('list.status')} value={f.status} onChange={setFilter('status')}><option value="ALL">{t('status.ALL')}</option><option value="POSTED">{t('status.POSTED')}</option><option value="VOIDED">{t('status.VOIDED')}</option></select>
        <label className="flex items-center gap-2 text-[14px]">{tc('from')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.from} max={f.to || undefined} onChange={setFilter('from')} /></label>
        <label className="flex items-center gap-2 text-[14px]">{tc('to')} <input type="date" className="input w-auto !text-[14px] !text-[#212121]" value={f.to} min={f.from || undefined} onChange={setFilter('to')} /></label>
      </div>
      {(err || list.error || ok) && <div className={`px-4 ${NOTICE}`}><Banner>{err || list.error}</Banner><Banner kind="ok">{ok}</Banner></div>}
      <div className="overflow-x-auto px-4">
        <table className="w-full border-collapse bg-white">
          <thead><tr>{COLS.map((k, i) => <th key={k} className={`${HEAD} ${i === 0 ? 'text-left' : 'text-center'}`}>{t(`list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length}>{filtered ? t('list.emptyFiltered') : t('list.emptyNone')}</td></tr>}
            {rows.map((r) => {
              const dead = r.status === 'VOIDED';
              return (
                <tr key={r.id} className="bg-white">
                  <td className={`${CELL} whitespace-nowrap text-left`}>{r.receiptNo}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{day(r.receiptDate)}</td>
                  <td className={`${CELL} text-center`}>{r.bankAccount?.accountName || '—'}<div className="text-xs">{r.bankAccount?.bank?.name} · {r.bankAccount?.accountNo}</div></td>
                  <td className={`${CELL} text-center`}>{r.receivedFrom}{r.reference && <div className="text-xs">{r.reference}</div>}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{t(`source.${r.source}`, { defaultValue: r.source })}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{t(`purpose.${r.purpose}`, { defaultValue: r.purpose })}</td>
                  <td className={`${CELL} whitespace-nowrap text-center ${dead ? '!text-slate-500 line-through' : ''}`}>{money(r.amount)}</td>
                  <td className={`${CELL} text-center`}><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${dead ? 'bg-red-500' : 'bg-emerald-600'}`} />{t(`status.${r.status}`, { defaultValue: r.status })}</span></td>
                  <td className={`${CELL} text-center`}><div className="flex justify-center">{!dead && can('fund_receipts.void') && <IconBtn label={t('actions.void')} tone={TONES.del} onClick={() => voidIt(r)}><BanIcon /></IconBtn>}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span>{tc('records', { total })}{list.data && <> · {t('list.postedTotal')}: <b>{money(list.data.postedTotal)}</b></>}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

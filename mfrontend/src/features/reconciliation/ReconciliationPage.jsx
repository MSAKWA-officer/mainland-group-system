import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { bankAccountApi, bankTransactionApi, errMsg } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import useLoad from '../../utils/useLoad';
import { AccountSelect, NOTICE, Stat, day, money, toCents, useAccounts } from '../banking/bankingUi.jsx';

// Loads every posted transaction of one account that is (or is not) reconciled, 100 at a time.
async function loadAll(bankAccountId, isReconciled) {
  const out = [];
  for (let page = 1; page <= 30; page += 1) {
    const r = await bankTransactionApi.list({ bankAccountId, status: 'POSTED', isReconciled, page, limit: 100, sortBy: 'txnDate', sortDir: 'asc' });
    out.push(...r.data);
    if (page * r.limit >= r.total) break;
  }
  return out;
}
const signed = (x) => (x.direction === 'CREDIT' ? 1 : -1) * toCents(x.amount);

// Match your ledger to the bank statement: tick the lines that appear on the statement and mark them reconciled.
// "Cleared balance" = the account balance without the lines that are not reconciled yet. When cleared balance + ticked lines equals the
// statement's closing balance, the difference is zero and the account is reconciled. (Balances need the bank_accounts.view_balance permission.)
// Text: locales/<lang>/reconciliation.json.
// Table look: Arial 14px, near-black text, 1px light-grey grid on every cell, ~39px rows,
// first column left-aligned and the rest centred, capital column titles.
const CELL = 'h-[39px] border border-[#e5e7eb] px-3 py-2 align-middle text-[14px] font-normal leading-5 text-[#212121]';
const HEAD = `${CELL} bg-white font-semibold uppercase`;
const al = (i) => (i === 0 ? 'text-left' : 'text-center');
const COLS = ['date', 'txnNo', 'type', 'details', 'moneyIn', 'moneyOut'];

export default function ReconciliationPage() {
  const { t } = useTranslation('reconciliation');
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState('false');                  // 'false' = not reconciled yet, 'true' = already reconciled (to undo)
  const [upTo, setUpTo] = useState('');
  const [statementBal, setStatementBal] = useState('');
  const [sel, setSel] = useState({});
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);

  const acct = useLoad(() => (accountId ? bankAccountApi.get(accountId) : Promise.resolve(null)), [accountId]);
  const rowsQ = useLoad(() => (accountId ? loadAll(accountId, mode) : Promise.resolve([])), [accountId, mode]);
  const unrec = useLoad(() => (accountId ? loadAll(accountId, 'false') : Promise.resolve([])), [accountId]);
  const all = rowsQ.data || [];
  const rows = useMemo(() => (upTo ? all.filter((x) => x.txnDate <= upTo) : all), [all, upTo]);
  const book = acct.data?.balance;                                           // only sent to users with view_balance
  const unrecNet = (unrec.data || []).reduce((s, x) => s + signed(x), 0);
  const cleared = book !== undefined && unrec.data ? toCents(book) - unrecNet : null;
  const picked = rows.filter((x) => sel[x.id]);
  const pickedNet = picked.reduce((s, x) => s + signed(x), 0);
  const pickedIn = picked.filter((x) => x.direction === 'CREDIT').reduce((s, x) => s + toCents(x.amount), 0);
  const pickedOut = picked.filter((x) => x.direction === 'DEBIT').reduce((s, x) => s + toCents(x.amount), 0);
  const marking = mode === 'false';
  const afterBal = cleared === null ? null : cleared + (marking ? pickedNet : -pickedNet);
  const diff = afterBal !== null && statementBal !== '' && marking ? toCents(statementBal) - afterBal : null;
  const allTicked = rows.length > 0 && rows.every((x) => sel[x.id]);

  const reload = () => { setSel({}); rowsQ.reload(); unrec.reload(); acct.reload(); };
  const pickAccount = (e) => { setAccountId(e.target.value); setSel({}); setStatementBal(''); setOk(''); setErr(''); };
  const apply = async () => {
    if (picked.length === 0) return;
    if (!window.confirm(t(marking ? 'confirmMark' : 'confirmUndo', { count: picked.length }))) return;
    setBusy(true); setErr(''); setOk('');
    let done = 0;
    try {
      for (const x of picked) { await bankTransactionApi.reconcile(x.id, marking); done += 1; }
      setOk(t(marking ? 'doneMark' : 'doneUndo', { count: done }));
    } catch (x) { setErr(t('stopped', { done, error: errMsg(x) })); }
    setBusy(false); reload();
  };
  const btnLabel = busy ? t('working') : marking
    ? (picked.length ? t('markBtn', { n: picked.length }) : t('markBtnNone'))
    : (picked.length ? t('undoBtn', { n: picked.length }) : t('undoBtnNone'));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
        <label className="block min-w-[16rem] flex-1 max-w-sm text-[14px]">{t('bankAccount')}
          <div className="mt-1"><AccountSelect accounts={accounts.data?.data} value={accountId} onChange={pickAccount} placeholder={t('selectAccount')} /></div></label>
        <label className="block text-[14px]">{t('linesToShow')}
          <select className="input mt-1 !text-[14px] !text-[#212121]" value={mode} onChange={(e) => { setMode(e.target.value); setSel({}); }}>
            <option value="false">{t('notReconciledYet')}</option><option value="true">{t('alreadyReconciled')}</option>
          </select></label>
        <label className="block text-[14px]">{t('upTo')}<input type="date" className="input mt-1 !text-[14px] !text-[#212121]" value={upTo} onChange={(e) => { setUpTo(e.target.value); setSel({}); }} /></label>
        {marking && book !== undefined && (
          <label className="block text-[14px]">{t('statementBalance')}
            <input className="input mt-1 !text-[14px] !text-[#212121]" type="number" step="0.01" placeholder={t('statementPlaceholder')} value={statementBal} onChange={(e) => setStatementBal(e.target.value)} /></label>
        )}
      </div>
      {(err || accounts.error || acct.error || rowsQ.error || ok) && <div className={`px-4 ${NOTICE}`}><Banner>{err || accounts.error || acct.error || rowsQ.error}</Banner><Banner kind="ok">{ok}</Banner></div>}
      {!accountId && <p className="px-4 pb-4 text-[14px]">{t('chooseAccount')}</p>}
      {accountId && (<>
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {book !== undefined && <Stat label={t('stats.ledger')} value={money(book)} />}
          {cleared !== null && <Stat label={t('stats.cleared')} value={money(cleared / 100)} />}
          <Stat label={marking ? t('stats.ticked') : t('stats.tickedUndo')} value={`${money(pickedIn / 100)} / ${money(pickedOut / 100)}`} />
          {diff !== null && <Stat label={t('stats.difference')} value={money(diff / 100)} tone={diff === 0 ? 'text-emerald-700' : 'text-red-600'} />}
        </div>
        {diff !== null && <p className="px-4 pb-4 text-[14px]">{diff === 0 ? t('matches') : t('mismatch', { after: money(afterBal / 100), statement: money(statementBal) })}</p>}
        {book === undefined && acct.data && <p className="px-4 pb-4 text-[14px]">{t('noPermission')}</p>}
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          <button type="button" className="btn-primary" disabled={busy || picked.length === 0} onClick={apply}>{btnLabel}</button>
          <span className="text-[14px]">{t('lines', { count: rows.length })}{rowsQ.loading && ` · ${t('loading')}`}</span>
          <Link to={`/bank-transactions?bankAccountId=${accountId}`} className="text-[14px] underline">{t('openIn')}</Link>
        </div>
        <div className="overflow-x-auto px-4">
          <table className="w-full border-collapse bg-white">
            <thead><tr>
              <th className={`${CELL} bg-white text-center`}><input type="checkbox" aria-label={t('tickAll')} checked={allTicked} onChange={(e) => setSel(e.target.checked ? Object.fromEntries(rows.map((x) => [x.id, true])) : {})} /></th>
              {COLS.map((k, i) => <th key={k} className={`${HEAD} ${al(i)}`}>{t(`columns.${k}`)}</th>)}
            </tr></thead>
            <tbody>
              {!rowsQ.loading && rows.length === 0 && <tr><td className={`${CELL} text-left`} colSpan={COLS.length + 1}>{marking ? t('emptyMark') : t('emptyUndo')}</td></tr>}
              {rows.map((x) => (
                <tr key={x.id} className="cursor-pointer bg-white" onClick={() => setSel({ ...sel, [x.id]: !sel[x.id] })}>
                  <td className={`${CELL} text-center`}><input type="checkbox" aria-label={t('tick', { no: x.txnNo })} checked={!!sel[x.id]} onClick={(e) => e.stopPropagation()} onChange={() => setSel({ ...sel, [x.id]: !sel[x.id] })} /></td>
                  <td className={`${CELL} whitespace-nowrap text-left`}>{day(x.txnDate)}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}><Link to={`/bank-transactions/${x.id}`} onClick={(e) => e.stopPropagation()} className="underline">{x.txnNo}</Link></td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{t(`type.${x.type}`, { defaultValue: x.type })}</td>
                  <td className={`${CELL} text-center`}>{[x.reference, x.description, x.counterparty].filter(Boolean).join(' · ') || '—'}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{x.direction === 'CREDIT' ? money(x.amount) : ''}</td>
                  <td className={`${CELL} whitespace-nowrap text-center`}>{x.direction === 'DEBIT' ? money(x.amount) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { bankAccountApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { day } from '../sales/saleUi.jsx';
import { NOTICE, RowActions, Status, money } from './BankAccountsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);
const Stat = ({ label, value, cur }) => (
  <div className="rounded-md border border-line p-3"><div className="text-xs uppercase">{label}</div><div className="mt-1 text-lg font-semibold">{money(value)} <span className="text-xs font-normal">{cur}</span></div></div>
);
const STMT_COLS = ['date', 'txnNo', 'type', 'details', 'debit', 'credit', 'balance', 'reconciled'];
const RIGHT = ['debit', 'credit', 'balance'];

// Statement: opening balance, every posted transaction with a running balance, closing balance. Needs view_balance + bank_transactions.read.
function Statement({ id, currency }) {
  const { t } = useTranslation('bankAccounts');
  const { t: tc } = useTranslation('common');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const s = useLoad(() => bankAccountApi.statement(id, { page, limit: 50, ...(range.from && { from: range.from }), ...(range.to && { to: range.to }) }), [id, page, range]);
  const d = s.data; const rows = d?.data || [];
  const bad = range.from && range.to && range.from > range.to;
  const change = (k) => (e) => { setRange({ ...range, [k]: e.target.value }); setPage(1); };
  return (
    <div className="border-t border-line px-6 py-5">
      <h2 className="text-lg font-semibold">{t('statement.title')}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">{t('statement.from')}<input className="input mt-1" type="date" value={range.from} onChange={change('from')} /></label>
        <label className="text-sm">{t('statement.to')}<input className="input mt-1" type="date" value={range.to} onChange={change('to')} /></label>
        {(range.from || range.to) && <button className="btn-ghost" onClick={() => { setRange({ from: '', to: '' }); setPage(1); }}>{t('statement.clearDates')}</button>}
      </div>
      <div className={`mt-3 ${NOTICE}`}><Banner>{s.error || (bad ? t('statement.badRange') : '')}</Banner></div>
      {d && (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Stat label={t('statement.opening')} value={d.openingBalance} cur={currency} /><Stat label={t('statement.moneyIn')} value={d.totalCredits} cur={currency} />
          <Stat label={t('statement.moneyOut')} value={d.totalDebits} cur={currency} /><Stat label={t('statement.closing')} value={d.closingBalance} cur={currency} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            {STMT_COLS.map((k) => <th key={k} className={`th px-4 py-2 font-normal uppercase text-black ${RIGHT.includes(k) ? 'text-right' : ''}`}>{t(`statement.columns.${k}`)}</th>)}
          </tr></thead>
          <tbody>
            {!s.loading && rows.length === 0 && <tr><td className="td px-4 text-black" colSpan={8}>{t('statement.empty')}</td></tr>}
            {rows.map((x) => (
              <tr key={x.id} className="odd:bg-slate-50/60">
                <td className="td whitespace-nowrap px-4 text-black">{day(x.txnDate)}</td>
                <td className="td whitespace-nowrap px-4 text-black">{x.txnNo}</td>
                <td className="td whitespace-nowrap px-4 text-black">{t(`txnType.${x.type}`, { defaultValue: x.type })}</td>
                <td className="td px-4 text-black">{[x.reference, x.description, x.counterparty].filter(Boolean).join(' · ') || '—'}</td>
                <td className="td whitespace-nowrap px-4 text-right text-black">{x.direction === 'DEBIT' ? money(x.amount) : ''}</td>
                <td className="td whitespace-nowrap px-4 text-right text-black">{x.direction === 'CREDIT' ? money(x.amount) : ''}</td>
                <td className="td whitespace-nowrap px-4 text-right text-black">{money(x.balance)}</td>
                <td className="td px-4 text-black">{x.isReconciled ? t('statement.yes') : t('statement.no')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between pt-3 text-sm text-black">
        <span>{t('statement.count', { n: d?.total ?? 0 })}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tc('previous')}</button>
          <button className="btn-ghost" disabled={page * (d?.limit || 50) >= (d?.total || 0)} onClick={() => setPage(page + 1)}>{tc('next')}</button>
        </div>
      </div>
    </div>
  );
}

export default function BankAccountsView() {
  const { t } = useTranslation('bankAccounts');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => bankAccountApi.get(id), [id]);
  const r = q.data;
  const seeBalance = r && r.balance !== undefined;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.accountName : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status active={r.isActive} /> : tc('loading')}</p>
        </div>
        <Link to="/bank-accounts" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          {seeBalance && (
            <div className="mb-4 max-w-sm rounded-md border border-line p-4">
              <div className="text-xs uppercase">{t('view.currentBalance')}</div>
              <div className="mt-1 text-2xl font-semibold">{money(r.balance)} <span className="text-sm font-normal">{r.currency}</span></div>
            </div>
          )}
          <dl className="max-w-3xl">
            <Row label={t('view.bank')}>{r.bank && (can('banks.read') ? <Link to={`/banks/${r.bank.id}`} className="underline">{r.bank.name}</Link> : r.bank.name)}</Row>
            <Row label={t('view.accountNo')}>{r.accountNo}</Row>
            <Row label={t('view.accountName')}>{r.accountName}</Row>
            <Row label={t('view.type')}>{t(`type.${r.accountType}`, { defaultValue: r.accountType })}</Row>
            <Row label={t('view.currency')}>{r.currency}</Row>
            <Row label={t('view.branch')}>{r.branch}</Row>
            {seeBalance && <Row label={t('view.openingBalance')}>{`${money(r.openingBalance)} ${r.currency}`}</Row>}
            <Row label={t('view.openingDate')}>{r.openingDate && day(r.openingDate)}</Row>
            <Row label={t('view.overdraft')}>{r.allowOverdraft ? t('view.allowed') : t('view.notAllowed')}</Row>
            <Row label={t('view.transactions')}>{String(r.transactionCount ?? 0)}</Row>
            <Row label={t('view.status')}><Status active={r.isActive} /></Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/bank-accounts', { state: { msg: t('actions.deleted') } })} />
          </div>
        </div>
      )}
      {r && can('bank_accounts.view_balance') && can('bank_transactions.read') && <Statement id={id} currency={r.currency} />}
    </div>
  );
}

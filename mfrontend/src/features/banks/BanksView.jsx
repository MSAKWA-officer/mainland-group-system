import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { bankApi, bankAccountApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, RowActions, Status } from './BanksList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);
const ACC_COLS = ['accountNo', 'accountName', 'type', 'currency', 'status'];

export default function BanksView() {
  const { t } = useTranslation('banks');
  const { t: ta } = useTranslation('bankAccounts');     // account type labels
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [err, setErr] = useState('');
  const q = useLoad(() => bankApi.get(id), [id]);
  const accounts = useLoad(() => (can('bank_accounts.read') ? bankAccountApi.list({ bankId: id, limit: 100 }) : Promise.resolve(null)), [id]);
  const r = q.data;
  const accs = accounts.data?.data || [];
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.name : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Status active={r.isActive} /> : tc('loading')}</p>
        </div>
        <Link to="/banks" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.code')}>{r.code}</Row>
            <Row label={t('view.name')}>{r.name}</Row>
            <Row label={t('view.shortName')}>{r.shortName}</Row>
            <Row label={t('view.swift')}>{r.swiftCode}</Row>
            <Row label={t('view.country')}>{r.country}</Row>
            <Row label={t('view.phone')}>{r.phone}</Row>
            <Row label={t('view.website')}>{r.website}</Row>
            <Row label={t('view.accounts')}>{String(r.accountCount ?? 0)}</Row>
            <Row label={t('view.status')}><Status active={r.isActive} /></Row>
            <Row label={t('view.notes')}>{r.notes}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/banks', { state: { msg: t('actions.deleted') } })} />
          </div>
        </div>
      )}
      {r && can('bank_accounts.read') && (
        <div className="border-t border-line px-6 py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('view.accountsTitle')}</h2>
            {can('bank_accounts.create') && r.isActive && <Link to={`/bank-accounts/new?bankId=${r.id}`} className="btn-ghost gap-2"><PlusIcon />{t('view.newAccount')}</Link>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50"><tr>{ACC_COLS.map((k) => <th key={k} className="th px-4 py-2 font-normal uppercase text-black">{t(`view.cols.${k}`)}</th>)}</tr></thead>
              <tbody>
                {!accounts.loading && accs.length === 0 && <tr><td className="td px-4 text-black" colSpan={5}>{t('view.noAccounts')}</td></tr>}
                {accs.map((a) => (
                  <tr key={a.id} className="odd:bg-slate-50/60">
                    <td className="td whitespace-nowrap px-4 text-black"><Link to={`/bank-accounts/${a.id}`} className="underline">{a.accountNo}</Link></td>
                    <td className="td px-4 text-black">{a.accountName}</td>
                    <td className="td px-4 text-black">{ta(`type.${a.accountType}`, { defaultValue: a.accountType })}</td>
                    <td className="td px-4 text-black">{a.currency}</td>
                    <td className="td px-4"><Status active={a.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

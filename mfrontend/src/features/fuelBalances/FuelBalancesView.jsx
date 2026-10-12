import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { fuelBalanceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon, PlusIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { METHOD } from '../banking/bankingUi.jsx';
import { NOTICE, Row, Stat, Th, day, money } from '../fuel/fuelUi.jsx';
import { StateDot, qty, useFuelText } from '../fuel/fuelText.jsx';

// One approved fuel funding: how much was given, how much has been spent, what is left, and every usage line that makes up the spending.
export default function FuelBalancesView() {
  const { t } = useTranslation('fuelBalances');
  const { t: tc } = useTranslation('common');
  const ft = useFuelText();
  const { id } = useParams();
  const { can } = useAuth();
  const q = useLoad(() => fuelBalanceApi.get(id), [id]);
  const r = q.data;
  const open = r && Number(r.balance) > 0;
  const heads = ['usageNo', 'date', 'litresCol', 'amount', 'pricePerLitre', 'odometer', 'station', 'receipt'];
  const rightCols = ['litresCol', 'amount', 'pricePerLitre'];
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? r.fundingNo : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <StateDot value={r.state} /> : tc('loading')}</p>
        </div>
        <div className="flex items-center gap-4">
          {open && can('fuel_usage.create') && <Link to={`/fuel-usage/new?fundingId=${r.id}`} className="btn-primary gap-2"><PlusIcon />{t('actions.recordUsage')}</Link>}
          <Link to="/fuel-balances" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
        </div>
      </div>
      {q.error && <div className={`px-6 ${NOTICE}`}><Banner>{q.error}</Banner></div>}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-3">
            <Stat label={t('stats.funded')} value={money(r.funded)} />
            <Stat label={t('stats.spent')} value={money(r.used)} />
            <Stat label={t('stats.balance')} value={money(r.balance)} tone={open ? 'text-red-600' : ''} />
          </div>
          <dl className="max-w-3xl">
            <Row label={t('view.vehicle')}>{r.plateNo}</Row>
            <Row label={t('view.driver')}>{r.driverName}</Row>
            <Row label={t('view.purpose')}>{r.purpose}</Row>
            <Row label={t('view.paidBy')}>{METHOD[r.method] || r.method}</Row>
            <Row label={t('view.moneyGivenOn')}>{day(r.disbursedOn)}</Row>
            <Row label={t('view.litres')}>{r.fundedLitres != null ? t('view.litresBoughtOf', { bought: ft.litres(r.usedLitres), planned: ft.litres(r.fundedLitres) }) : t('view.litresBought', { bought: ft.litres(r.usedLitres) })}</Row>
            <Row label={t('view.lastUsage')}>{r.lastUsageDate && day(r.lastUsageDate)}</Row>
            {open && <Row label={t('view.daysUnspent')}>{t('view.daysUnspentValue', { count: r.daysOutstanding })}</Row>}
          </dl>

          <h2 className="mb-2 mt-6 text-base font-semibold">{t('view.usageTitle', { count: r.fills })}</h2>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[40rem]">
              <thead className="bg-slate-50"><tr>{heads.map((k) => <Th key={k} right={rightCols.includes(k)}>{t(`view.${k}`)}</Th>)}</tr></thead>
              <tbody>
                {(r.usages || []).length === 0 && <tr><td className="td px-6 text-black" colSpan={8}>{t('view.nothing')}</td></tr>}
                {(r.usages || []).map((u) => (
                  <tr key={u.id} className="odd:bg-slate-50/60">
                    <td className="td whitespace-nowrap px-6 text-black">{can('fuel_usage.read') ? <Link to={`/fuel-usage/${u.id}`} className="underline">{u.usageNo}</Link> : u.usageNo}</td>
                    <td className="td whitespace-nowrap px-6 text-black">{day(u.usageDate)}</td>
                    <td className="td whitespace-nowrap px-6 text-right text-black">{qty(u.litres, 3)}</td>
                    <td className="td whitespace-nowrap px-6 text-right text-black">{money(u.amount)}</td>
                    <td className="td whitespace-nowrap px-6 text-right text-black">{money(u.pricePerLitre)}</td>
                    <td className="td whitespace-nowrap px-6 text-black">{u.odometerKm != null ? ft.km(u.odometerKm) : '—'}</td>
                    <td className="td px-6 text-black">{u.station || '—'}</td>
                    <td className="td px-6 text-black">{u.receiptNo || '—'}</td>
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

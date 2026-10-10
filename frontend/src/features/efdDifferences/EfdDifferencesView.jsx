import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { efdDifferenceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon, RefreshIcon } from '../../components/Icons.jsx';
import { CELL, HEAD, al } from '../../components/TableUi.js';
import useLoad from '../../utils/useLoad';
import { Row } from '../banking/bankingUi.jsx';
import { NOTICE, Variance, day, tzToday } from '../efdReconciliations/reconUi.jsx';
import { COUNTS, Next, Sev, addDays, factLabel, factValue, findingMessage, typeLabel } from './diffUi.jsx';

// A finding has no id of its own: its key is "TYPE:deviceId:date:ref". The scan is read-only and cheap, so the page asks for the
// days around that date, of that type and device, and picks the finding with the same key (so a reload always shows fresh data).
async function findFinding(key) {
  const [type, dev, date] = String(key || '').split(':');
  if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const today = tzToday();
  const to = addDays(date, 1) > today ? today : addDays(date, 1);     // the server refuses a future end date
  const from = addDays(date, -1) > to ? to : addDays(date, -1);       // one day either side: the key's date is not always the scan's date
  for (let page = 1; page <= 5; page += 1) {
    const r = await efdDifferenceApi.scan({ from, to, type, ...(dev && dev !== '-' && { deviceId: dev }), page, limit: 100 });
    const hit = r.data.find((x) => x.key === key);
    if (hit) return hit;
    if (page * r.limit >= r.total) break;
  }
  return null;
}

const has = (o, k) => !!o && o[k] !== null && o[k] !== undefined && o[k] !== '';

export default function EfdDifferencesView() {
  const { t } = useTranslation('efdDifferences');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const [sp] = useSearchParams();
  const key = sp.get('key') || '';
  const q = useLoad(() => findFinding(key), [key]);
  const x = q.data;
  const notFound = !q.loading && !q.error && !x;
  const items = x ? [...new Set([...Object.keys(x.expected || {}), ...Object.keys(x.actual || {}), ...Object.keys(x.difference || {})])] : [];
  const heads = [t('view.item'), t('list.columns.expected'), t('list.columns.actual'), t('list.columns.difference')];
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{x ? typeLabel(x, t) : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-sm">{x ? <Sev s={x.severity} /> : tc('loading')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-ghost gap-2" onClick={q.reload} disabled={q.loading}><RefreshIcon />{t('view.rescan')}</button>
          <Link to="/efd-differences" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('view.backToList')}</Link>
        </div>
      </div>
      {(q.error || notFound) && <div className={`px-6 ${NOTICE}`}><Banner>{q.error || t('view.notFound')}</Banner></div>}
      {x && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.severity')}><Sev s={x.severity} /></Row>
            <Row label={t('view.type')}>{typeLabel(x, t)}</Row>
            <Row label={t('view.date')}>{day(x.date)}</Row>
            <Row label={t('view.device')}>{x.deviceSerial && x.deviceId && can('efd_devices.read')
              ? <Link to={`/efd-devices/${x.deviceId}`} className="text-black underline">{x.deviceSerial}</Link> : x.deviceSerial}</Row>
            <Row label={t('view.found')}>{findingMessage(x, t)}</Row>
            {x.ageDays != null && <Row label={t('view.age')}>{t('list.ageDays', { days: x.ageDays })}</Row>}
          </dl>

          <h2 className="mt-6 text-lg font-semibold">{t('view.compareTitle')}</h2>
          <p className="mb-3 mt-1 max-w-3xl text-sm">{t('view.compareHelp')}</p>
          {items.length === 0 ? <p className="text-sm">{t('view.noFigures')}</p> : (
            <div className="max-w-3xl overflow-x-auto">
              <table className="w-full border-collapse bg-white">
                <thead><tr>{heads.map((h, i) => <th key={h} className={`${HEAD} ${al(i)}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {items.map((k) => (
                    <tr key={k} className="bg-white">
                      <td className={`${CELL} text-left`}>{factLabel(k, t)}</td>
                      <td className={`${CELL} whitespace-nowrap text-center`}>{has(x.expected, k) ? factValue(k, x.expected[k]) : '—'}</td>
                      <td className={`${CELL} whitespace-nowrap text-center`}>{has(x.actual, k) ? factValue(k, x.actual[k]) : '—'}</td>
                      <td className={`${CELL} whitespace-nowrap text-center`}>{!has(x.difference, k) ? '—' : k === 'missingCount' ? <b className="text-red-600">{x.difference[k]}</b> : <Variance v={x.difference[k]} count={COUNTS.includes(k)} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mt-6 text-lg font-semibold">{t('view.nextTitle')}</h2>
          <div className="mt-2 pb-2"><Next x={x} /></div>
        </div>
      )}
    </div>
  );
}

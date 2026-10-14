import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from './Card.jsx';
import { fmt, fmtMoney, fmtNum } from '../../utils/format';

const TONES = { bad: 'text-danger', warn: 'text-amber' };
const TILE = 'block border border-slate-200 px-3 py-2.5';

// Quantities can have up to 3 decimals (kg, litres ...), so they are shown in full, never rounded to a whole number.
const show = (m) => (m.kind === 'money' ? fmtMoney(m.value, m.currency) : m.kind === 'qty' ? fmtNum(m.value, 3) : fmtNum(m.value));

function Tile({ m }) {
  const { t } = useTranslation('dashboard');
  const label = t(`metrics.${m.key}`, { defaultValue: m.key });
  const body = (
    <>
      <div className="text-xs text-mn-text">{m.currency && m.kind === 'money' ? `${label} (${m.currency})` : label}</div>
      <div className={`mt-0.5 text-xl font-bold leading-tight ${TONES[m.tone] || 'text-slate-800'}`}>{show(m)}</div>
    </>
  );
  return m.to
    ? <Link to={m.to} className={`${TILE} hover:bg-mn-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-mn`}>{body}</Link>
    : <div className={TILE}>{body}</div>;
}

export const Tiles = ({ metrics }) => (
  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">{metrics.map((m, i) => <Tile key={`${m.key}-${m.currency || i}`} m={m} />)}</div>
);

// One cell of a list row, formatted by the column kind.
function Cell({ col, row }) {
  const { t } = useTranslation('movements');
  const v = row[col.key];
  if (col.kind === 'qty') return <>{fmtNum(v, 3)}</>;
  if (col.kind === 'money') return <>{fmtMoney(v)}</>;
  if (col.kind === 'date') return <>{v ? new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</>;
  if (col.kind === 'datetime') return <>{fmt(v)}</>;
  if (col.kind === 'type') return <>{t(`types.${v}`, { defaultValue: v })}</>;
  if (col.kind === 'direction') return <>{t(`direction.${v}`, { defaultValue: v })}</>;
  return <>{v ?? '—'}</>;
}

// A small table under the figures of a module (items needing attention, expiring batches, recent movements ...).
function ListTable({ list }) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[#555]">{t(`lists.${list.key}`, { defaultValue: list.key })}</h3>
        {list.to && <Link to={list.to} className="text-xs text-mn-link hover:underline">{t('viewAll')}</Link>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>{list.columns.map((c) => <th key={c.key} className="border-b border-slate-200 py-1.5 pr-3 text-left font-bold text-mn-link">{t(`cols.${c.key}`, { defaultValue: c.key })}</th>)}</tr></thead>
          <tbody>
            {list.rows.length === 0 && <tr><td colSpan={list.columns.length} className="py-3 text-slate-500">{t('listEmpty')}</td></tr>}
            {list.rows.map((r, i) => (
              <tr key={r.id || i} className="border-b border-slate-100 align-top">
                {list.columns.map((c) => <td key={c.key} className="py-1.5 pr-3 text-slate-700"><Cell col={c} row={r} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One module: its name as the heading, its summary figures underneath, then any detail lists.
export default function ModuleSummary({ module }) {
  const { t } = useTranslation('dashboard');
  const lists = module.lists || [];
  return (
    <Card title={t(`modules.${module.key}`, { defaultValue: module.key })}>
      {module.error
        ? <p className="text-sm text-slate-500">{t('moduleError')}</p>
        : (
          <>
            {module.metrics.length > 0 && <Tiles metrics={module.metrics} />}
            {lists.length > 0 && <div className="mt-5 grid items-start gap-6 xl:grid-cols-2">{lists.map((l) => <ListTable key={l.key} list={l} />)}</div>}
          </>
        )}
    </Card>
  );
}

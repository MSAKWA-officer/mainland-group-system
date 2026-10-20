import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from './Card.jsx';
import { fmtMoney, fmtNum } from '../../utils/format';

const TONES = { bad: 'text-danger', warn: 'text-amber' };
const TILE = 'block border border-slate-200 px-3 py-2.5';

// Quantities can have up to 3 decimals (kg, litres ...), so they are shown in full, never rounded to a whole number.
const show = (m) => (m.kind === 'money' ? fmtMoney(m.value, m.currency) : m.kind === 'qty' ? fmtNum(m.value, 3) : fmtNum(m.value));

function Tile({ m }) {
  const { t } = useTranslation('dashboard');
  const label = t(`metrics.${m.key}`, { defaultValue: m.key, name: m.name });
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

// One module: its name as the heading, its summary figures underneath.
export default function ModuleSummary({ module }) {
  const { t } = useTranslation('dashboard');
  return (
    <Card title={t(`modules.${module.key}`, { defaultValue: module.key })}>
      {module.error
        ? <p className="text-sm text-slate-500">{t('moduleError')}</p>
        : <Tiles metrics={module.metrics} />}
    </Card>
  );
}

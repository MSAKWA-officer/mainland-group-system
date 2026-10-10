import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import { ReportFilters, TYPES, fromQuery, toQuery } from './fuelReportUi.jsx';

// Change the filters of the report you are looking at (/fuel-reports/:type/edit?...), then run it again.
export default function FuelReportsUpdate() {
  const { t } = useTranslation('fuelReports');
  const { type } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [f, setF] = useState(() => (TYPES.includes(type) ? fromQuery(type, sp) : {}));
  if (!TYPES.includes(type)) return <Navigate to="/fuel-reports" replace />;
  const run = (e) => { e.preventDefault(); navigate(`/fuel-reports/${type}?${toQuery(type, f)}`); };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('update.title')}</h1>
          <p className="mt-1 text-sm">{t('update.subtitle', { report: t(`tabs.${type}`) })}</p>
        </div>
        <Link to={`/fuel-reports/${type}?${toQuery(type, f)}`} className="inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeftIcon />{t('back')}</Link>
      </div>
      <form onSubmit={run} className="space-y-4 border-t border-line px-6 py-6">
        <ReportFilters type={type} value={f} onChange={setF} />
        <button className="btn-primary">{t('update.run')}</button>
      </form>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon } from '../../components/Icons.jsx';
import { ParamSummary, ReportBody, TYPES, fromQuery, pick, toQuery } from './fuelReportUi.jsx';

// One report on its own page (/fuel-reports/:type?from=...&to=...). The filters live in the address, so the page can be bookmarked, shared and printed.
export default function FuelReportsView() {
  const { t } = useTranslation('fuelReports');
  const { type } = useParams();
  const [sp] = useSearchParams();
  if (!TYPES.includes(type)) return <Navigate to="/fuel-reports" replace />;
  const params = pick(type, fromQuery(type, sp));
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')} · {t(`tabs.${type}`)}</h1>
          <div className="mt-0.5"><ParamSummary type={type} params={params} /></div>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Link to={`/fuel-reports/${type}/edit?${toQuery(type, params)}`} className="btn-ghost gap-2"><PencilIcon />{t('changeParams')}</Link>
          <button type="button" className="btn-ghost" onClick={() => window.print()}>{t('print')}</button>
          <Link to="/fuel-reports" className="inline-flex items-center gap-2 hover:underline"><ArrowLeftIcon />{t('back')}</Link>
        </div>
      </div>
      <ReportBody type={type} params={params} />
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PlusIcon } from '../../components/Icons.jsx';
import { DEFAULTS, ReportBody, ReportFilters, TYPES, pick, toQuery } from './fuelReportUi.jsx';

// Company-wide fuel reports (needs fuel_reports.read, so it is for managers). Everything is calculated live from approved fundings and active usage.
// This replaces FuelReportsPage.jsx; the three old report files (ConsumptionReport, ReconciliationReport, MonthlyReport) are no longer used.
export default function FuelReportsList() {
  const { t } = useTranslation('fuelReports');
  const [type, setType] = useState('consumption');
  const [f, setF] = useState(DEFAULTS);
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[18px] font-bold">{t('title')}</h1>
          <p className="mt-0.5 text-[14px]">{t('intro')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/fuel-reports/${type}?${toQuery(type, f)}`} className="btn-ghost">{t('openFull')}</Link>
          <Link to="/fuel-reports/new" className="btn-primary gap-2 px-4 py-2 text-[14px] font-bold"><PlusIcon />{t('generate')}</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4" role="tablist" aria-label={t('tabsLabel')}>
        {TYPES.map((k) => <button key={k} type="button" role="tab" aria-selected={type === k} className={type === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setType(k)}>{t(`tabs.${k}`)}</button>)}
      </div>
      <div className="px-4 pb-4"><ReportFilters type={type} value={f} onChange={setF} /></div>
      <ReportBody type={type} params={pick(type, f)} />
    </div>
  );
}

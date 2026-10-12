import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import Field from '../../components/Field.jsx';
import { DEFAULTS, ReportFilters, TYPES, toQuery } from './fuelReportUi.jsx';

// Pick a report and its filters, then open it. Reports are calculated live, so nothing is saved.
export default function FuelReportsCreate() {
  const { t } = useTranslation('fuelReports');
  const navigate = useNavigate();
  const [type, setType] = useState('consumption');
  const [f, setF] = useState(DEFAULTS);
  const run = (e) => { e.preventDefault(); navigate(`/fuel-reports/${type}?${toQuery(type, f)}`); };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('create.title')}</h1>
          <p className="mt-1 text-sm">{t('create.subtitle')}</p>
        </div>
        <Link to="/fuel-reports" className="inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeftIcon />{t('back')}</Link>
      </div>
      <form onSubmit={run} className="space-y-4 border-t border-line px-6 py-6">
        <div className="max-w-sm">
          <Field label={t('params.report')}>
            <select className="input !text-black" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((k) => <option key={k} value={k}>{t(`tabs.${k}`)}</option>)}</select>
          </Field>
        </div>
        <ReportFilters type={type} value={f} onChange={setF} />
        <button className="btn-primary">{t('create.run')}</button>
      </form>
    </div>
  );
}

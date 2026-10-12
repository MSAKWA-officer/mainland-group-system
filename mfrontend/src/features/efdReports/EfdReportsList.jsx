import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { efdDeviceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useLoad from '../../utils/useLoad';
import EfdDailyReport from './EfdDailyReport.jsx';
import EfdDeviceReport from './EfdDeviceReport.jsx';
import EfdMonthlyReport from './EfdMonthlyReport.jsx';
import EfdReceiptRegister from './EfdReceiptRegister.jsx';
import EfdUnreceiptedReport from './EfdUnreceiptedReport.jsx';

// Tab code (also the key of tabs.<code> in locales/<lang>/efdReports.json) -> report component.
const TABS = [['daily', EfdDailyReport], ['devices', EfdDeviceReport], ['monthly', EfdMonthlyReport], ['receipts', EfdReceiptRegister], ['unreceipted', EfdUnreceiptedReport]];

// Company-wide EFD reports (needs efd_reports.read, so it is for managers). Everything is calculated live from the records in the system;
// downloading a CSV needs efd_reports.export and is written to the audit log.
export default function EfdReportsList() {
  const { t } = useTranslation('efdReports');
  const { can } = useAuth();
  const [tab, setTab] = useState('daily');
  const canDevices = can('efd_devices.read');
  const devs = useLoad(() => (canDevices ? efdDeviceApi.list({ limit: 100 }) : Promise.resolve(null)), [canDevices]);
  const Current = TABS.find(([k]) => k === tab)[1];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">{t('title')}</h1>
        <p className="mt-0.5 text-[14px]">{t('subtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4" role="tablist" aria-label={t('tabsAria')}>
        {TABS.map(([k]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(k)}>{t(`tabs.${k}`)}</button>)}
      </div>
      <Current key={tab} devices={devs.data?.data || []} />
    </div>
  );
}

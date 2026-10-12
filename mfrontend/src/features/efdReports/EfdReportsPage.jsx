import { useState } from 'react';
import { efdDeviceApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useLoad from '../../utils/useLoad';
import EfdDailyReport from './EfdDailyReport.jsx';
import EfdDeviceReport from './EfdDeviceReport.jsx';
import EfdMonthlyReport from './EfdMonthlyReport.jsx';
import EfdReceiptRegister from './EfdReceiptRegister.jsx';
import EfdUnreceiptedReport from './EfdUnreceiptedReport.jsx';

const TABS = [
  ['daily', 'Daily summary', EfdDailyReport], ['devices', 'By device', EfdDeviceReport], ['monthly', 'Month by month', EfdMonthlyReport],
  ['receipts', 'Receipt register', EfdReceiptRegister], ['unreceipted', 'Orders without receipt', EfdUnreceiptedReport],
];

// Company-wide EFD reports (needs efd_reports.read, so it is for managers). Everything is calculated live from the records in the system;
// downloading a CSV needs efd_reports.export and is written to the audit log.
export default function EfdReportsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('daily');
  const canDevices = can('efd_devices.read');
  const devs = useLoad(() => (canDevices ? efdDeviceApi.list({ limit: 100 }) : Promise.resolve(null)), [canDevices]);
  const Current = TABS.find(([k]) => k === tab)[2];
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="p-4">
        <h1 className="text-[18px] font-bold">EFD reports</h1>
        <p className="mt-0.5 text-[14px]">Only issued receipts count towards sales and VAT; voided receipts are shown separately. Days are trading days in the business time zone.</p>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4" role="tablist" aria-label="EFD reports">
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <Current key={tab} devices={devs.data?.data || []} />
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errMsg, vehicleRequestApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead, day } from '../fuel/fuelUi.jsx';
import { ReqStatus } from './VehicleRequestList.jsx';

const CELL = 'border border-[#e5e7eb] px-2 py-2 align-middle text-[13px] text-[#212121]';
const COLS = ['date', 'userName', 'department', 'purpose', 'status', 'plate', 'driver', 'keyTaken', 'keyReturned'];
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// The paper REQUEST form for one month (rejected and voided requests are left out). Download gives the Excel form with the grey signature columns.
export default function VehicleRequestRegister() {
  const { t } = useTranslation('vehicleRequests');
  const { can } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const reg = useLoad(() => (month ? vehicleRequestApi.register({ month }) : Promise.resolve(null)), [month]);
  const s = reg.data;
  const download = async () => { setErr(''); setBusy(true); try { await vehicleRequestApi.downloadRegister({ month }); } catch (x) { setErr(errMsg(x)); } setBusy(false); };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('register.title')} sub={t('register.sub')}>
        <Link to="/vehicle-requests" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('register.back')}</Link>
      </PageHead>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
        <input className="input w-auto" type="month" aria-label={t('register.month')} value={month} onChange={(e) => setMonth(e.target.value)} />
        {can('vehicle_requests.export') && <button className="btn-primary" disabled={!s || busy} onClick={download}>{busy ? t('register.downloading') : t('register.download')}</button>}
      </div>
      <div className={`px-6 ${NOTICE}`}><Banner>{err || reg.error}</Banner></div>
      {s && (
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full border-collapse bg-white">
            <thead><tr>{COLS.map((k) => <th key={k} className={`${CELL} bg-white text-center font-semibold uppercase`}>{t(`register.columns.${k}`)}</th>)}</tr></thead>
            <tbody>
              {s.rows.length === 0 && <tr><td className={CELL} colSpan={COLS.length}>{t('register.empty')}</td></tr>}
              {s.rows.map((r) => (
                <tr key={r.requestNo}>
                  <td className={`${CELL} whitespace-nowrap`}>{day(r.date)}</td><td className={CELL}>{r.userName}</td><td className={CELL}>{r.department}</td><td className={CELL}>{r.purpose}</td>
                  <td className={CELL}><ReqStatus value={r.status} /></td><td className={`${CELL} text-center`}>{r.plateNo}</td><td className={CELL}>{r.driverName}</td>
                  <td className={`${CELL} text-center`}>{r.keyTaken}</td><td className={`${CELL} text-center`}>{r.keyReturned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errMsg, vehicleLogApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmtNum } from '../../utils/format';
import { NOTICE, PageHead, day, useAllVehicles } from '../fuel/fuelUi.jsx';

const CELL = 'border border-[#e5e7eb] px-2 py-2 align-middle text-[13px] text-[#212121]';
const COLS = ['date', 'userName', 'purpose', 'timeStart', 'startKm', 'timeEnd', 'endKm', 'totalKm', 'fuelKm', 'litres', 'payment', 'receiptNo'];
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const n = (v, dp) => (v == null ? '' : fmtNum(v, dp));

// The paper "Official Vehicle USE and FUELING Registration Form" for one vehicle and one month: trips on the left, fuelings (from Fuel usage) on the right.
export default function VehicleLogSheet() {
  const { t } = useTranslation('vehicleLog');
  const { can } = useAuth();
  const vehicles = useAllVehicles();
  const [vehicleId, setVehicleId] = useState(''); const [month, setMonth] = useState(thisMonth());
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const sheet = useLoad(() => (vehicleId && month ? vehicleLogApi.sheet({ vehicleId, month }) : Promise.resolve(null)), [vehicleId, month]);
  const s = sheet.data;
  const download = async () => { setErr(''); setBusy(true); try { await vehicleLogApi.downloadSheet({ vehicleId, month }); } catch (x) { setErr(errMsg(x)); } setBusy(false); };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('sheet.title')} sub={t('sheet.sub')}>
        <Link to="/vehicle-log" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('sheet.back')}</Link>
      </PageHead>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
        <select className="input max-w-[16rem]" aria-label={t('sheet.vehicle')} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">{t('sheet.selectVehicle')}</option>{(vehicles.data || []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
        <input className="input w-auto" type="month" aria-label={t('sheet.month')} value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} />
        {can('vehicle_log.export') && <button className="btn-primary" disabled={!s || busy} onClick={download}>{busy ? t('sheet.downloading') : t('sheet.download')}</button>}
      </div>
      <div className={`px-6 ${NOTICE}`}><Banner>{err || sheet.error}</Banner></div>
      {!vehicleId && <p className="px-6 pb-6 text-sm">{t('sheet.pick')}</p>}
      {s && (
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr><th colSpan={8} className={`${CELL} bg-yellow-300 text-center font-bold`}>{t('sheet.useBand')}</th><th colSpan={4} className={`${CELL} bg-yellow-300 text-center font-bold`}>{t('sheet.fuelBand')}</th></tr>
              <tr>{COLS.map((k) => <th key={k} className={`${CELL} bg-white text-center font-semibold uppercase`}>{t(`sheet.columns.${k}`)}</th>)}</tr>
            </thead>
            <tbody>
              {s.rows.length === 0 && <tr><td className={CELL} colSpan={COLS.length}>{t('sheet.empty')}</td></tr>}
              {s.rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${CELL} whitespace-nowrap`}>{day(r.date)}</td><td className={CELL}>{r.userName}</td><td className={CELL}>{r.purpose}</td>
                  <td className={`${CELL} text-center`}>{r.timeStart}</td><td className={`${CELL} text-right`}>{n(r.startKm, 1)}</td>
                  <td className={`${CELL} text-center`}>{r.timeEnd}</td><td className={`${CELL} text-right`}>{n(r.endKm, 1)}</td><td className={`${CELL} text-right font-semibold`}>{n(r.totalKm, 1)}</td>
                  <td className={`${CELL} text-right`}>{n(r.fuelOdometerKm, 1)}</td><td className={`${CELL} text-right`}>{n(r.litres, 3)}</td>
                  <td className={`${CELL} text-center`}>{r.paymentMethod ? t(`payment.${r.paymentMethod}`) : ''}</td><td className={CELL}>{r.receiptNo}</td>
                </tr>
              ))}
              <tr className="bg-[#f2f2f2] font-bold"><td className={CELL} colSpan={7}>{t('sheet.total')}</td><td className={`${CELL} text-right`}>{fmtNum(s.totals.totalKm, 1)}</td><td className={CELL} /><td className={`${CELL} text-right`}>{fmtNum(s.totals.litres, 3)}</td><td className={CELL} colSpan={2} /></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

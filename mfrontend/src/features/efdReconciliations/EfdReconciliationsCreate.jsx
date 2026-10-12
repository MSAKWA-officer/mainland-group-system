import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { efdDeviceApi, efdReconciliationApi, errMsg, fieldErrs } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Banner from '../../components/Banner.jsx';
import Field from '../../components/Field.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { FiguresTable, NOTICE, PageHead, Status, day, tzToday } from './reconUi.jsx';

// Pick a device and a day, see the figures (nothing is saved yet), then start the reconciliation.
// Open it with ?deviceId=…&date=YYYY-MM-DD to start with a device and day chosen.
export default function EfdReconciliationsCreate() {
  const { t } = useTranslation('efd');
  const navigate = useNavigate();
  const { can } = useAuth();
  const [sp] = useSearchParams();
  const devs = useLoad(() => efdDeviceApi.list({ isActive: 'true', limit: 100 }), []);
  const [f, setF] = useState({ deviceId: sp.get('deviceId') || '', date: sp.get('date') || tzToday() });
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const devices = devs.data?.data || [];
  useEffect(() => { if (devices.length === 1) setF((p) => (p.deviceId ? p : { ...p, deviceId: devices[0].id })); }, [devices.length]); // eslint-disable-line
  const ready = !!f.deviceId && !!f.date;
  const pv = useLoad(() => (ready ? efdReconciliationApi.preview({ deviceId: f.deviceId, date: f.date }) : Promise.resolve(null)), [f.deviceId, f.date]);
  const p = pv.data;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const start = async () => {
    setErr(''); setFe({}); setBusy(true);
    try {
      const r = await efdReconciliationApi.create({ deviceId: f.deviceId, reconDate: f.date });
      navigate(`/efd-reconciliations/${r.id}`, { state: { msg: t('recon.create.started') } });
    } catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('recon.create.title')} sub={t('recon.create.sub')}>
        <Link to="/efd-reconciliations" className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('shared.backToList')}</Link>
      </PageHead>
      <div className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || devs.error || pv.error}</Banner></div>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label={t('shared.device')} error={fe.deviceId}>
            <select className="input" required value={f.deviceId} onChange={set('deviceId')}>
              <option value="">{t('shared.chooseDevice')}</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.serialNo})</option>)}
            </select>
          </Field>
          <Field label={t('recon.create.day')} error={fe.reconDate}><input className="input" type="date" required max={tzToday()} value={f.date} onChange={set('date')} /></Field>
        </div>

        {ready && pv.loading && !p && <p className="text-sm">{t('recon.create.loadingFigures')}</p>}
        {p && (
          <div className="space-y-4">
            {!p.zReport && (
              <div className={NOTICE}><Banner>
                {t('recon.create.noZ', { device: p.device.name, date: day(p.date) })}{' '}
                {can('efd_z_reports.create') && <Link to={`/efd-z-reports/new?deviceId=${p.device.id}`} className="underline">{t('recon.create.recordZFirst')}</Link>}
              </Banner></div>
            )}
            {p.existing && (
              <div className={NOTICE}><Banner>
                <Trans i18nKey="recon.create.existing" ns="efd"
                  values={{ no: p.existing.reconNo, status: t(`recon.status.${p.existing.status}`, { defaultValue: p.existing.status }).toLowerCase() }}
                  components={{ l: <Link to={`/efd-reconciliations/${p.existing.id}`} className="underline" /> }} />
              </Banner></div>
            )}
            {p.zReport && (
              <>
                <p className="text-sm">
                  {t('recon.create.zLine')} {can('efd_z_reports.read') ? <Link to={`/efd-z-reports/${p.zReport.id}`} className="underline">{p.zReport.reportNo}</Link> : p.zReport.reportNo} {t('recon.create.zNumber', { z: p.zReport.zNumber })} · <Status status={p.zReport.status} />
                </p>
                {p.zReport.status !== 'VERIFIED' && <div className={NOTICE}><Banner>{t('recon.create.zNotVerified')}</Banner></div>}
                {p.figures && <FiguresTable f={p.figures} />}
                {p.hasDifference && <div className={NOTICE}><Banner>{t('recon.create.hasDifference')}</Banner></div>}
              </>
            )}
            <button type="button" className="btn-primary" disabled={busy || !p.canStart} onClick={start}>{busy ? t('recon.create.starting') : t('recon.create.start')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

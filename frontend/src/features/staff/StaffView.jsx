import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { staffApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { RowActions, Tag } from './StaffList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{children || '—'}</dd>
  </div>
);

// One staff member: personal details, the login account (if any) and the same icon actions as the list.
export default function StaffView() {
  const { t } = useTranslation('staff');
  const { id } = useParams();
  const navigate = useNavigate();
  const [err, setErr] = useState('');
  const q = useLoad(() => staffApi.get(id), [id]);
  const s = q.data;
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{s ? s.fullName : t('view.fallbackTitle')}</h1>
          {s && <p className="mt-1 text-sm">{s.code} · <Tag>{s.isActive ? t('active') : t('inactive')}</Tag></p>}
        </div>
        <div className="flex items-center gap-4">
          {s && <RowActions r={s} onChanged={q.reload} onError={setErr} afterDelete={() => navigate('/staff', { state: { msg: t('msg.deleted') } })} />}
          <Link to="/staff" className="inline-flex items-center gap-2 text-sm hover:underline"><ArrowLeftIcon />{t('view.back')}</Link>
        </div>
      </div>
      <div className="px-6"><Banner>{err || q.error}</Banner></div>
      {s && (
        <div className="grid gap-8 border-t border-line px-6 py-4 lg:grid-cols-2">
          <section>
            <h2 className="mb-1 text-base font-semibold">{t('view.details')}</h2>
            <dl>
              <Row label={t('view.code')}>{s.code}</Row>
              <Row label={t('view.fullName')}>{s.fullName}</Row>
              <Row label={t('view.position')}>{s.position}</Row>
              <Row label={t('view.phone')}>{s.phone}</Row>
              <Row label={t('view.email')}>{s.email}</Row>
              <Row label={t('view.address')}>{s.address}</Row>
              <Row label={t('view.status')}>{s.isActive ? t('active') : t('inactive')}</Row>
              <Row label={t('view.created')}>{s.createdAt && fmt(s.createdAt)}</Row>
              <Row label={t('view.updated')}>{s.updatedAt && fmt(s.updatedAt)}</Row>
            </dl>
          </section>
          <section>
            <h2 className="mb-1 text-base font-semibold">{t('view.loginAccount')}</h2>
            {s.user ? (
              <dl>
                <Row label={t('view.username')}>{s.user.username}</Row>
                <Row label={t('view.role')}>{s.user.role?.name}</Row>
                <Row label={t('view.accountStatus')}>{t(`view.accountStates.${s.user.status}`, { defaultValue: s.user.status })}</Row>
              </dl>
            ) : <p className="py-2.5 text-sm">{t('view.noAccountNote')}</p>}
          </section>
        </div>
      )}
    </div>
  );
}

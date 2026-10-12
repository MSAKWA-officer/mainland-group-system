import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { categoryApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { NOTICE, RowActions, Status } from './CategoriesList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-[14px] text-black sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium">{label}</dt><dd>{children ?? '—'}</dd>
  </div>
);

export default function CategoriesView() {
  const { t } = useTranslation('categories');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => categoryApi.get(id), [id]);
  const r = q.data;
  return (
    <div className="panel overflow-hidden bg-white font-[Arial,Helvetica,sans-serif] text-[14px] text-[#212121] shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-[18px] font-bold">{r ? r.name : t('view.fallbackTitle')}</h1>
          <p className="mt-1 text-[14px]">{r ? <Status active={r.isActive} /> : tc('loading')}</p>
        </div>
        <Link to="/categories" className="inline-flex items-center gap-2 text-[14px] text-black hover:underline"><ArrowLeftIcon />{t('backToList')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className={`px-6 ${NOTICE}`}><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('form.name')}>{r.name}</Row>
            <Row label={t('view.parent')}>{r.parent?.name}</Row>
            <Row label={t('form.description')}>{r.description}</Row>
            <Row label={t('view.itemsIn')}>{r.itemCount}</Row>
            <Row label={t('form.status')}><Status active={r.isActive} /></Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.updated')}>{fmt(r.updatedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onError={setErr} afterDelete={() => navigate('/categories', { state: { msg: t('view.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

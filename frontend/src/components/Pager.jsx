import { useTranslation } from 'react-i18next';

export default function Pager({ page, total, limit, set }) {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-center justify-between px-3 py-3 text-sm text-slate-600">
      <span>{t('records', { total })}</span>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => set(page - 1)}>{t('previous')}</button>
        <button className="btn-ghost" disabled={page * limit >= total} onClick={() => set(page + 1)}>{t('next')}</button>
      </div>
    </div>
  );
}
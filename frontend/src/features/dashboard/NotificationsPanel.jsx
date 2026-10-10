import { useTranslation } from 'react-i18next';
import Card from './Card.jsx';
import { fmt } from '../../utils/format';

const Tick = ({ unread }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    className={`mr-2 inline shrink-0 ${unread ? 'text-[#e8506a]' : 'text-slate-300'}`}><path d="M20 6L9 17l-5-5" /></svg>
);

export default function NotificationsPanel({ notes, onReadAll }) {
  const { t } = useTranslation('dashboard');
  return (
    <Card title={t('notifTitle')}
      action={notes.unread > 0 && <button type="button" onClick={onReadAll} className="text-sm text-mn-link hover:underline">{t('markAll', { count: notes.unread })}</button>}>
      {notes.data.length === 0 ? (
        <p className="text-sm text-slate-500">{t('notifEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{['colTitle', 'colDetails', 'colReceived'].map((k) => <th key={k} className="border-b border-slate-200 py-2 pr-3 text-left font-bold text-mn-link">{t(k)}</th>)}</tr></thead>
            <tbody>
              {notes.data.map((n) => (
                <tr key={n.id} className="border-b border-slate-100 align-top">
                  <td className={`py-2.5 pr-3 ${n.readAt ? 'text-slate-700' : 'font-bold text-slate-800'}`}><Tick unread={!n.readAt} />{n.title}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{n.body}</td>
                  <td className="whitespace-nowrap py-2.5 text-slate-500">{fmt(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
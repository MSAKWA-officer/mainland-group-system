import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { approvalApi } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import Pill from '../../components/Pill.jsx';
import useLoad from '../../utils/useLoad';
import { fmt } from '../../utils/format';
import { RowActions, TONE, useApprovalText } from './ApprovalsList.jsx';

const Row = ({ label, children }) => (
  <div className="grid gap-1 border-b border-line/70 py-2.5 text-sm sm:grid-cols-[11rem_1fr]">
    <dt className="font-medium text-slate-500">{label}</dt><dd>{children || '—'}</dd>
  </div>
);

export default function ApprovalsView() {
  const x = useApprovalText();
  const { t } = x;
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [err, setErr] = useState('');
  const q = useLoad(() => approvalApi.get(id), [id]);
  const r = q.data;
  return (
    <div className="panel overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{r ? x.type(r.type) : t('view.defaultTitle')}</h1>
          <p className="mt-1 text-sm">{r ? <Pill tone={TONE[r.status]}>{x.status(r.status)}</Pill> : t('view.loading')}</p>
        </div>
        <Link to="/approvals" className="text-sm text-blue-600 hover:underline">{t('view.back')}</Link>
      </div>
      {(err || q.error || location.state?.msg) && (
        <div className="px-6"><Banner>{err || q.error}</Banner><Banner kind="ok">{location.state?.msg}</Banner></div>
      )}
      {r && (
        <div className="border-t border-line px-6 py-4">
          <dl className="max-w-3xl">
            <Row label={t('view.requestedBy')}>{r.requester?.fullName}</Row>
            <Row label={t('view.created')}>{fmt(r.createdAt)}</Row>
            <Row label={t('view.submitted')}>{r.submittedAt && fmt(r.submittedAt)}</Row>
            <Row label={t('view.note')}>{r.payload?.note}</Row>
            <Row label={t('view.decision')}>{r.decider && `${r.decider.fullName}, ${fmt(r.decidedAt)}`}</Row>
            <Row label={t('view.decisionNote')}>{r.decisionNote}</Row>
            <Row label={t('view.executed')}>{r.executedAt && fmt(r.executedAt)}</Row>
          </dl>
          <div className="mt-4 pb-2">
            <RowActions r={r} onChanged={q.reload} onError={setErr}
              afterDelete={() => navigate('/approvals', { state: { msg: t('view.deleted') } })} />
          </div>
        </div>
      )}
    </div>
  );
}

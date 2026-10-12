import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errMsg, expenseApi, fieldErrs } from '../../api/index.js';
import Banner from '../../components/Banner.jsx';
import { ArrowLeftIcon } from '../../components/Icons.jsx';
import useLoad from '../../utils/useLoad';
import { NOTICE, PageHead } from '../banking/bankingUi.jsx';
import ExpensesForm, { EMPTY, fromExpense, toBody } from './ExpensesForm.jsx';

// Only the person who submitted an expense can edit it, and only while it is still waiting for a decision.
export default function ExpensesUpdate() {
  const { t } = useTranslation('expenses');
  const { t: tc } = useTranslation('common');
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLoad(() => expenseApi.get(id), [id]);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState(''); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const e0 = item.data;
  useEffect(() => { if (e0) setF(fromExpense(e0)); }, [e0]);
  const locked = e0 && e0.status !== 'PENDING';
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setFe({}); setBusy(true);
    try { await expenseApi.update(id, toBody(f)); navigate(`/expenses/${id}`, { state: { msg: t('update.saved') } }); }
    catch (x) { setErr(errMsg(x)); setFe(fieldErrs(x)); setBusy(false); }
  };
  return (
    <div className="panel overflow-hidden text-black shadow-sm">
      <PageHead title={t('update.title')} sub={e0 ? e0.expenseNo : tc('loading')}>
        <Link to={`/expenses/${id}`} className="inline-flex items-center gap-2 text-sm text-black hover:underline"><ArrowLeftIcon />{t('update.back')}</Link>
      </PageHead>
      <form onSubmit={submit} className="space-y-4 border-t border-line px-6 py-6 [&_.text-danger]:!text-black">
        <div className={NOTICE}><Banner>{err || item.error}</Banner>{locked && <Banner>{t('update.locked', { status: t(`status.${e0.status}`, { defaultValue: e0.status }).toLowerCase() })}</Banner>}</div>
        {e0 && !locked && (<>
          <ExpensesForm f={f} setF={setF} fe={fe} />
          <button className="btn-primary" disabled={busy}>{busy ? t('update.saving') : t('update.submit')}</button>
        </>)}
      </form>
    </div>
  );
}

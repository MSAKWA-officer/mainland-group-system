const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, bool } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/efdReconciliationController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const STATUSES = ['OPEN', 'RECONCILED', 'VOIDED'];
const createS = z.object({ deviceId: uuid, reconDate: date });
const previewQ = z.object({ deviceId: uuid, date });
const reconcileS = z.object({ explanation: opt(text(1000)) });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const range = (q) => !q.from || !q.to || q.from <= q.to;
const listQ = z.object({
  search: text(80).optional(), status: z.enum([...STATUSES, 'ALL']).default('ALL'), deviceId: uuid.optional(), createdBy: uuid.optional(),
  from: date.optional(), to: date.optional(), hasDifference: bool.optional(),
  sortBy: z.enum(['reconDate', 'reconNo', 'grossVariance']).default('reconDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('efd_reconciliations.read'), validate(listQ, 'query'), ah(c.list));
router.get('/preview', authorize('efd_reconciliations.create'), validate(previewQ, 'query'), ah(c.preview));      // before /:id on purpose
router.post('/', authorize('efd_reconciliations.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('efd_reconciliations.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/refresh', authorize('efd_reconciliations.create'), validate(idParam, 'params'), ah(c.refresh));
router.post('/:id/reconcile', authorize('efd_reconciliations.reconcile'), validate(idParam, 'params'), validate(reconcileS), ah(c.reconcile));
router.post('/:id/void', authorize('efd_reconciliations.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
// There is deliberately no PATCH and no DELETE: figures are calculated by the server, and a reconciliation is only ever voided.
module.exports = router;

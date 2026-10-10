const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, money } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/transferController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const amount = money.refine((n) => n > 0, 'Amount must be greater than 0');

// :id in the URL is the transfer's transferGroupId (the id shared by its two ledger rows).
const createS = z.object({ fromAccountId: uuid, toAccountId: uuid, amount, txnDate: date.optional(), reference: opt(text(100)), description: opt(text(255)) })
  .refine((o) => o.fromAccountId !== o.toAccountId, { message: 'Choose two different accounts', path: ['toAccountId'] })
  .refine((o) => o.reference || o.description, { message: 'Add a reference or a description', path: ['description'] });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const listQ = z.object({
  search: text(80).optional(), fromAccountId: uuid.optional(), toAccountId: uuid.optional(), status: z.enum(['POSTED', 'VOIDED', 'ALL']).default('ALL'),
  from: date.optional(), to: date.optional(),
  sortBy: z.enum(['txnDate', 'amount', 'txnNo']).default('txnDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('transfers.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('transfers.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('transfers.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('transfers.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

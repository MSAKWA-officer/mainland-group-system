const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, money } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/paymentController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE'];
const amount = money.refine((n) => n > 0, 'Amount must be greater than 0');

// Paying an expense: send expenseId (the payee is taken from the expense if you leave it out). Paying someone directly: send payee.
const createS = z.object({
  expenseId: opt(uuid), payee: opt(text(150)), amount, method: z.enum(METHODS), bankAccountId: opt(uuid), reference: opt(text(100)), paidOn: date.optional(), notes: opt(text(500)),
}).refine((p) => p.expenseId || p.payee, { message: 'Enter who this payment is made to', path: ['payee'] })
  .refine((p) => p.method === 'CASH' || p.reference, { message: 'A payment reference is required for this method', path: ['reference'] })
  .refine((p) => !['BANK', 'CHEQUE', 'CARD'].includes(p.method) || p.bankAccountId, { message: 'Choose the bank account this payment is paid from', path: ['bankAccountId'] });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const listQ = z.object({
  search: text(80).optional(), expenseId: uuid.optional(), bankAccountId: uuid.optional(), method: z.enum(METHODS).optional(),
  status: z.enum(['ACTIVE', 'VOIDED', 'ALL']).default('ACTIVE'), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['paidOn', 'amount', 'paymentNo', 'payee']).default('paidOn'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('payments.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('payments.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('payments.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('payments.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

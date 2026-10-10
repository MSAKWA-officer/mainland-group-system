const router = require('express').Router();
const { z, uuid, idParam, paging, bool, text, money, date } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/bankTransactionController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const ALL_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'CHARGE', 'INTEREST', 'CUSTOMER_PAYMENT'];
const MANUAL_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'CHARGE', 'INTEREST'];          // transfers and customer payments are created by their own endpoints only
const amount = money.refine((n) => n > 0, 'Amount must be greater than 0');
const note = { reference: opt(text(100)), description: opt(text(255)) };
const needsNote = { message: 'Add a reference or a description', path: ['description'] };
const hasNote = (o) => !!(o.reference || o.description);

const createS = z.object({ bankAccountId: uuid, type: z.enum(MANUAL_TYPES), amount, txnDate: date.optional(), counterparty: opt(text(150)), ...note }).refine(hasNote, needsNote);
const transferS = z.object({ fromAccountId: uuid, toAccountId: uuid, amount, txnDate: date.optional(), ...note })
  .refine((o) => o.fromAccountId !== o.toAccountId, { message: 'Choose two different accounts', path: ['toAccountId'] });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const reconcileS = z.object({ reconciled: z.boolean() });
const listQ = z.object({
  search: text(80).optional(), bankAccountId: uuid.optional(), type: z.enum(ALL_TYPES).optional(), direction: z.enum(['CREDIT', 'DEBIT']).optional(),
  status: z.enum(['POSTED', 'VOIDED', 'ALL']).default('ALL'), isReconciled: bool.optional(), transferGroupId: uuid.optional(), customerPaymentId: uuid.optional(),
  from: date.optional(), to: date.optional(),
  sortBy: z.enum(['txnDate', 'amount', 'txnNo']).default('txnDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('bank_transactions.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('bank_transactions.create'), validate(createS), ah(c.create));
router.post('/transfer', authorize('bank_transactions.transfer'), validate(transferS), ah(c.transfer));
router.get('/:id', authorize('bank_transactions.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('bank_transactions.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
router.patch('/:id/reconcile', authorize('bank_transactions.reconcile'), validate(idParam, 'params'), validate(reconcileS), ah(c.reconcile));
module.exports = router;

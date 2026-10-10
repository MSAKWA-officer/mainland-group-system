const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, money } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/customerPaymentController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE'];
const amount = money.refine((n) => n > 0, 'Amount must be greater than 0');

// allocations is optional: leave it out and the money is applied to the customer's oldest unpaid credit sales first.
const allocation = z.object({ saleId: uuid, amount });
const createS = z.object({
  customerId: uuid, amount, method: z.enum(METHODS), bankAccountId: opt(uuid), reference: opt(text(100)), paidOn: date.optional(), notes: opt(text(500)),
  allocations: z.array(allocation).min(1).max(50).optional(),
}).refine((p) => p.method === 'CASH' || p.reference, { message: 'A payment reference is required for this method', path: ['reference'] })
  .refine((p) => !['BANK', 'CHEQUE', 'CARD'].includes(p.method) || p.bankAccountId, { message: 'Choose the bank account this payment was paid into', path: ['bankAccountId'] })
  .refine((p) => !p.allocations || new Set(p.allocations.map((a) => a.saleId)).size === p.allocations.length, { message: 'A sale can only appear once', path: ['allocations'] });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const customerParam = z.object({ customerId: uuid });
const listQ = z.object({
  search: text(80).optional(), customerId: uuid.optional(), bankAccountId: uuid.optional(), method: z.enum(METHODS).optional(),
  status: z.enum(['ACTIVE', 'VOIDED', 'ALL']).default('ACTIVE'), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['paidOn', 'amount', 'paymentNo', 'customer']).default('paidOn'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('customer_payments.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('customer_payments.create'), validate(createS), ah(c.create));
router.get('/open-sales/:customerId', authorize('customer_payments.create'), validate(customerParam, 'params'), ah(c.openSales));   // what a payment can be applied to
router.get('/:id', authorize('customer_payments.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('customer_payments.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

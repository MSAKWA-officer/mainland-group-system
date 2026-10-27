const router = require('express').Router();
const { z, uuid, idParam, paging, date, bool, text, decimal } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/creditSaleController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const line = z.object({
  itemId: uuid,
  quantity: decimal(3).refine((n) => n > 0 && n <= 1000000, 'Quantity must be between 0 and 1,000,000'),
  unitPrice: opt(decimal(2).refine((n) => n >= 0 && n <= 100000000, 'Price must be between 0 and 100,000,000')),   // needs credit_sales.set_price
  discountPercent: opt(decimal(2).refine((n) => n >= 0 && n <= 100, 'Discount must be between 0 and 100')),        // needs credit_sales.set_price
});
const head = {
  customerId: uuid, salespersonId: opt(uuid), dueDate: opt(date), notes: opt(text(2000)),
  taxRate: decimal(2).refine((n) => n >= 0 && n <= 100, 'Tax rate must be between 0 and 100'),
};
const createS = z.object({ ...head, taxRate: head.taxRate.optional(), lines: z.array(line).min(1).max(200) });
const updateS = z.object({ ...head, lines: z.array(line).min(1).max(200) }).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const listQ = z.object({ status: z.enum(['DRAFT', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'VOIDED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(), customerId: uuid.optional(), salespersonId: uuid.optional(), createdBy: uuid.optional(),
  search: text(80).optional(), from: date.optional(), to: date.optional(), overdue: bool.optional(), ...paging });
const cancelS = z.object({ reason: text(500).optional() });
const noteS = z.object({ note: text(500).optional() });
const voidS = z.object({ reason: text(500).min(3, 'Give a reason') });
const paymentS = z.object({
  amount: decimal(2).refine((n) => n > 0 && n <= 999999999999, 'Amount must be greater than 0'),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE']), bankAccountId: opt(uuid), reference: opt(text(100)), paidOn: opt(date), notes: opt(text(1000)),
}).refine((p) => p.method === 'CASH' || p.reference, { message: 'A payment reference is required for this method', path: ['reference'] })
  .refine((p) => !NEEDS_ACCOUNT.includes(p.method) || p.bankAccountId, { message: 'Choose the bank or mobile money account', path: ['bankAccountId'] });
const NEEDS_ACCOUNT = ['BANK', 'CARD', 'MOBILE_MONEY'];
const payParams = z.object({ id: uuid, paymentId: uuid });
const custParam = z.object({ customerId: uuid });

// Fixed paths first, so they are never read as /:id
router.get('/receivables', authorize('credit_sales.read'), ah(c.receivables));
router.get('/payment-accounts', authorize('credit_sales.receive_payment'), ah(c.paymentAccounts));          // accounts to choose when receiving a payment
router.get('/credit-status/:customerId', authorize('credit_sales.read'), validate(custParam, 'params'), ah(c.creditStatus));

router.get('/', authorize('credit_sales.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('credit_sales.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('credit_sales.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('credit_sales.create'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.delete('/:id', authorize('credit_sales.create'), validate(idParam, 'params'), ah(c.remove));
router.post('/:id/submit', authorize('credit_sales.create'), validate(idParam, 'params'), ah(c.submit));
// Cancel a draft / submitted sale: the creator only (checked in the service).
router.post('/:id/cancel', authorize('credit_sales.create'), validate(idParam, 'params'), validate(cancelS), ah(c.cancel));
router.post('/:id/approve', authorize('credit_sales.approve'), validate(idParam, 'params'), validate(noteS), ah(c.approve));
router.post('/:id/reject', authorize('credit_sales.approve'), validate(idParam, 'params'), validate(noteS), ah(c.reject));
router.post('/:id/void', authorize('credit_sales.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
router.post('/:id/payments', authorize('credit_sales.receive_payment'), validate(idParam, 'params'), validate(paymentS), ah(c.receivePayment));
router.post('/:id/payments/:paymentId/void', authorize('credit_sales.void_payment'), validate(payParams, 'params'), validate(voidS), ah(c.voidPayment));
module.exports = router;

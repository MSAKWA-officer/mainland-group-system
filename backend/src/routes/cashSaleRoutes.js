const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, decimal } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/cashSaleController');

const NEEDS_ACCOUNT = ['BANK', 'CARD', 'MOBILE_MONEY'];
const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const line = z.object({
  itemId: uuid,
  quantity: decimal(3).refine((n) => n > 0 && n <= 1000000, 'Quantity must be between 0 and 1,000,000'),
  unitPrice: opt(decimal(2).refine((n) => n >= 0 && n <= 100000000, 'Price must be between 0 and 100,000,000')),   // needs cash_sales.set_price
  discountPercent: opt(decimal(2).refine((n) => n >= 0 && n <= 100, 'Discount must be between 0 and 100')),        // needs cash_sales.set_price
});
const payment = z.object({
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE']),
  amountTendered: opt(decimal(2).refine((n) => n > 0 && n <= 999999999999, 'Invalid amount')),                     // CASH only; change = tendered - total
  bankAccountId: opt(uuid),                                                                                         // registered bank / mobile money account (required for BANK, CARD, MOBILE_MONEY)
  reference: opt(text(100)),                                                                                        // mobile money / bank / card / cheque reference
}).refine((p) => p.method === 'CASH' || p.reference, { message: 'A payment reference is required for this method', path: ['reference'] })
  .refine((p) => !NEEDS_ACCOUNT.includes(p.method) || p.bankAccountId, { message: 'Choose the bank or mobile money account', path: ['bankAccountId'] });
const createS = z.object({
  customerId: opt(uuid), walkInName: opt(text(150)), walkInPhone: opt(text(30)), salespersonId: opt(uuid),
  notes: opt(text(2000)), taxRate: decimal(2).refine((n) => n >= 0 && n <= 100, 'Tax rate must be between 0 and 100').optional(),
  lines: z.array(line).min(1).max(200), payment,
});
const voidS = z.object({ reason: text(500).min(3, 'Give a reason') });
const listQ = z.object({ status: z.enum(['COMPLETED', 'VOIDED']).optional(), paymentStatus: z.enum(['PAID']).optional(), customerId: uuid.optional(),
  salespersonId: uuid.optional(), createdBy: uuid.optional(), search: text(80).optional(), from: date.optional(), to: date.optional(), ...paging });

router.get('/payment-accounts', authorize('cash_sales.create'), ah(c.paymentAccounts));          // before '/:id'
router.get('/', authorize('cash_sales.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('cash_sales.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('cash_sales.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('cash_sales.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

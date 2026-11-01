const router = require('express').Router();
const { z, uuid, date } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/paymentReportController');

const MAX_DAYS = 366;
const dayCount = (q) => (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86400000 + 1;
const base = { from: date, to: date, method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE']).optional(), saleType: z.enum(['CASH', 'CREDIT']).optional(),
  customerId: uuid.optional(), bankAccountId: uuid.optional(), format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json') };
const withPeriod = (shape) => z.object(shape)
  .refine((q) => q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] })
  .refine((q) => !(q.from <= q.to) || dayCount(q) <= MAX_DAYS, { message: `Choose at most ${MAX_DAYS} days`, path: ['to'] });
const summaryQ = withPeriod({ ...base, groupBy: z.enum(['day', 'month', 'year']).default('day') });
const periodQ = withPeriod(base);

// A CSV, Excel or PDF download needs payment_reports.export on top of payment_reports.read.
const exportGate = (req, res, next) => (['csv', 'xlsx', 'pdf'].includes(req.query.format) ? authorize('payment_reports.export')(req, res, next) : next());
const read = authorize('payment_reports.read');
router.get('/detail', read, validate(periodQ, 'query'), exportGate, ah(c.detail));
router.get('/summary', read, validate(summaryQ, 'query'), exportGate, ah(c.summary));
router.get('/methods', read, validate(periodQ, 'query'), exportGate, ah(c.methods));
router.get('/customers', read, validate(periodQ, 'query'), exportGate, ah(c.customers));
router.get('/accounts', read, validate(periodQ, 'query'), exportGate, ah(c.accounts));
router.get('/paid-out', read, authorize('payments.read'), validate(periodQ, 'query'), exportGate, ah(c.paidOut));   // money paid OUT also needs payments.read
module.exports = router;

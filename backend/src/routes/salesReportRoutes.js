const router = require('express').Router();
const { z, uuid, date } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/salesReportController');

const MAX_DAYS = 366;
const dayCount = (q) => (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86400000 + 1;
const base = { from: date, to: date, saleType: z.enum(['CASH', 'CREDIT']).optional(), salespersonId: uuid.optional(), format: z.enum(['json', 'csv', 'xlsx']).default('json') };
const withPeriod = (shape) => z.object(shape)
  .refine((q) => q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] })
  .refine((q) => !(q.from <= q.to) || dayCount(q) <= MAX_DAYS, { message: `Choose at most ${MAX_DAYS} days`, path: ['to'] });
const summaryQ = withPeriod({ ...base, groupBy: z.enum(['day', 'month', 'year']).default('day') });
const periodQ = withPeriod(base);

// A CSV or Excel download needs a second permission on top of sales_reports.read.
const csvGate = (req, res, next) => (['csv', 'xlsx'].includes(req.query.format) ? authorize('sales_reports.export')(req, res, next) : next());
const read = authorize('sales_reports.read');
router.get('/detail', read, validate(periodQ, 'query'), csvGate, ah(c.detail));
router.get('/summary', read, validate(summaryQ, 'query'), csvGate, ah(c.summary));
router.get('/salespersons', read, validate(periodQ, 'query'), csvGate, ah(c.salespersons));
router.get('/customers', read, validate(periodQ, 'query'), csvGate, ah(c.customers));
router.get('/products', read, validate(periodQ, 'query'), csvGate, ah(c.products));
module.exports = router;

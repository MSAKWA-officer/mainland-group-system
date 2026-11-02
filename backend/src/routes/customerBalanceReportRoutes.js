const router = require('express').Router();
const { z, uuid, date, bool } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/customerBalanceReportController');

const MAX_DAYS = 1100;   // statement: about 3 years
const format = z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json');
const asOfQ = z.object({ asOf: date.optional(), from: date.optional(), customerId: uuid.optional(), salespersonId: uuid.optional(),
  includeZero: bool.default('false'), overdueOnly: bool.default('false'), format })
  .refine((q) => !q.from || !q.asOf || q.from <= q.asOf, { message: '"from" must not be after "as at"', path: ['from'] });
const statementQ = z.object({ customerId: uuid, from: date, to: date, format })
  .refine((q) => q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] })
  .refine((q) => !(q.from <= q.to) || (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86400000 + 1 <= MAX_DAYS, { message: `Choose at most ${MAX_DAYS} days`, path: ['to'] });

const exportGate = (req, res, next) => (['csv', 'xlsx', 'pdf'].includes(req.query.format) ? authorize('customer_balance_reports.export')(req, res, next) : next());
const read = authorize('customer_balance_reports.read');
router.get('/balances', read, validate(asOfQ, 'query'), exportGate, ah(c.balances));
router.get('/ageing', read, validate(asOfQ, 'query'), exportGate, ah(c.ageing));
router.get('/invoices', read, validate(asOfQ, 'query'), exportGate, ah(c.invoices));
router.get('/statement', read, validate(statementQ, 'query'), exportGate, ah(c.statement));
module.exports = router;

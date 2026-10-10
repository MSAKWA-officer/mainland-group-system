const router = require('express').Router();
const { z, uuid, paging, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/efdReportController');

const MAX_DAYS = 366;
const dayCount = (q) => (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86400000 + 1;
const format = z.enum(['json', 'csv']).default('json');
// Reports that cover a period need both dates (so a CSV file always says which period it holds).
const period = { from: date, to: date, deviceId: uuid.optional(), format };
const checkPeriod = (q) => q.from <= q.to;
const checkLength = (q) => dayCount(q) <= MAX_DAYS;
const withPeriod = (shape) => z.object(shape)
  .refine(checkPeriod, { message: '"from" must not be after "to"', path: ['from'] })
  .refine((q) => !checkPeriod(q) || checkLength(q), { message: `Choose at most ${MAX_DAYS} days`, path: ['to'] });

const periodQ = withPeriod(period);
const devicesQ = withPeriod({ ...period });
const receiptsQ = withPeriod({ ...period, status: z.enum(['ISSUED', 'VOIDED']).optional(), search: text(80).optional(), ...paging });
const unreceiptedQ = withPeriod({ from: date, to: date, format });
const monthlyQ = z.object({ year: z.coerce.number().int().min(2000).max(2100).default(() => new Date().getFullYear()), deviceId: uuid.optional(), format });

// A CSV download needs a second permission on top of efd_reports.read.
const csvGate = (req, res, next) => (req.query.format === 'csv' ? authorize('efd_reports.export')(req, res, next) : next());
const read = authorize('efd_reports.read');

router.get('/daily', read, validate(periodQ, 'query'), csvGate, ah(c.daily));
router.get('/devices', read, validate(devicesQ, 'query'), csvGate, ah(c.devices));
router.get('/monthly', read, validate(monthlyQ, 'query'), csvGate, ah(c.monthly));
router.get('/receipts', read, validate(receiptsQ, 'query'), csvGate, ah(c.receipts));
router.get('/unreceipted', read, validate(unreceiptedQ, 'query'), csvGate, ah(c.unreceipted));
module.exports = router;

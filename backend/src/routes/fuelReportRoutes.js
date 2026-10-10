const router = require('express').Router();
const { z, uuid, date } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/fuelReportController');

const range = (q) => !q.from || !q.to || q.from <= q.to;
const rangeMsg = { message: '"from" must not be after "to"', path: ['from'] };
const consumptionQ = z.object({ from: date.optional(), to: date.optional(), vehicleId: uuid.optional() }).refine(range, rangeMsg);
const reconciliationQ = z.object({ from: date.optional(), to: date.optional(), groupBy: z.enum(['vehicle', 'driver']).default('vehicle') }).refine(range, rangeMsg);
const monthlyQ = z.object({ year: z.coerce.number().int().min(2000).max(2100).default(() => new Date().getFullYear()), vehicleId: uuid.optional(), driverId: uuid.optional() });

router.get('/consumption', authorize('fuel_reports.read'), validate(consumptionQ, 'query'), ah(c.consumption));
router.get('/reconciliation', authorize('fuel_reports.read'), validate(reconciliationQ, 'query'), ah(c.reconciliation));
router.get('/monthly', authorize('fuel_reports.read'), validate(monthlyQ, 'query'), ah(c.monthly));
module.exports = router;

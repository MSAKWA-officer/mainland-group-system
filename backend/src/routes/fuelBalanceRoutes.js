const router = require('express').Router();
const { z, uuid, idParam, paging, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/fuelBalanceController');

const STATES = ['OPEN', 'SETTLED', 'ALL'];
const range = (q) => !q.from || !q.to || q.from <= q.to;
const rangeMsg = { message: '"from" must not be after "to"', path: ['from'] };
const listQ = z.object({
  search: text(80).optional(), vehicleId: uuid.optional(), driverId: uuid.optional(), state: z.enum(STATES).default('OPEN'), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['disbursedOn', 'balance', 'funded', 'fundingNo']).default('disbursedOn'), sortDir: z.enum(['asc', 'desc']).default('asc'), ...paging,
}).refine(range, rangeMsg);
const summaryQ = z.object({ groupBy: z.enum(['vehicle', 'driver']).default('vehicle'), state: z.enum(STATES).default('ALL'), from: date.optional(), to: date.optional(),
  vehicleId: uuid.optional(), driverId: uuid.optional() }).refine(range, rangeMsg);

// Read-only: balances are calculated from fundings and usage. The :id is the FUNDING id.
router.get('/', authorize('fuel_balances.read'), validate(listQ, 'query'), ah(c.list));
router.get('/summary', authorize('fuel_balances.read'), validate(summaryQ, 'query'), ah(c.summary));
router.get('/:id', authorize('fuel_balances.read'), validate(idParam, 'params'), ah(c.getOne));
module.exports = router;

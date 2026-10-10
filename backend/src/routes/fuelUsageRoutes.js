const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, money, quantity, decimal } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/fuelUsageController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const noBlank = (s) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());
const STATUSES = ['ACTIVE', 'VOIDED'];

// price per litre is NOT accepted: the server calculates it from amount / litres.
const fields = {
  usageDate: noBlank(date),                                                           // defaults to today
  litres: quantity, amount: money.refine((n) => n > 0, 'Amount must be greater than 0'),
  odometerKm: opt(decimal(1).refine((n) => n >= 0 && n <= 999999999, 'Enter a valid odometer reading')),
  isFullTank: z.boolean(), station: opt(text(100)), receiptNo: opt(text(50)), notes: opt(text(1000)),
};
const createS = z.object({ fuelFundingId: uuid, ...fields, isFullTank: fields.isFullTank.default(true) });
const updateS = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');   // the funding itself can never be changed
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const range = (q) => !q.from || !q.to || q.from <= q.to;
const listQ = z.object({
  search: text(80).optional(), fuelFundingId: uuid.optional(), vehicleId: uuid.optional(), driverId: uuid.optional(), createdBy: uuid.optional(),
  status: z.enum([...STATUSES, 'ALL']).default('ALL'), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['usageDate', 'amount', 'litres', 'usageNo']).default('usageDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('fuel_usage.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('fuel_usage.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('fuel_usage.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('fuel_usage.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.post('/:id/void', authorize('fuel_usage.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

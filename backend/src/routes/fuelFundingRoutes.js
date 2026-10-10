const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, money, quantity } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/fuelFundingController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'VOIDED'];
const amount = money.refine((n) => n > 0, 'Amount must be greater than 0');
const noBlank = (s) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());

const fields = {
  vehicleId: uuid, driverId: noBlank(uuid),                        // driver is optional: it defaults to the vehicle's default driver
  amount, litres: opt(quantity), purpose: text(255).min(3, 'Say what the fuel is for (trip or route)'),
  method: z.enum(METHODS), bankAccountId: opt(uuid), reference: opt(text(100)), fundingDate: date.optional(), notes: opt(text(1000)),
};
const needsBank = (o) => !['BANK', 'CARD', 'CHEQUE'].includes(o.method) || !!o.bankAccountId;
const createS = z.object(fields).refine(needsBank, { message: 'Choose the bank account this is paid from', path: ['bankAccountId'] });
const updateS = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');   // method / bank rule is re-checked on the merged record in the service
const approveS = z.object({ note: opt(text(500)) });
const rejectS = z.object({ note: text(500).min(3, 'Give a reason for rejecting this request') });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const range = (q) => !q.from || !q.to || q.from <= q.to;
const rangeMsg = { message: '"from" must not be after "to"', path: ['from'] };
const listQ = z.object({
  search: text(80).optional(), vehicleId: uuid.optional(), driverId: uuid.optional(), method: z.enum(METHODS).optional(), bankAccountId: uuid.optional(),
  status: z.enum([...STATUSES, 'ALL']).default('ALL'), createdBy: uuid.optional(), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['fundingDate', 'amount', 'fundingNo']).default('fundingDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, rangeMsg);
const summaryQ = z.object({ from: date.optional(), to: date.optional(), groupBy: z.enum(['vehicle', 'driver']).default('vehicle') }).refine(range, rangeMsg);

router.get('/', authorize('fuel_funding.read'), validate(listQ, 'query'), ah(c.list));
router.get('/summary', authorize('fuel_funding.read'), validate(summaryQ, 'query'), ah(c.summary));
router.post('/', authorize('fuel_funding.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('fuel_funding.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('fuel_funding.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.post('/:id/approve', authorize('fuel_funding.approve'), validate(idParam, 'params'), validate(approveS), ah(c.approve));
router.post('/:id/reject', authorize('fuel_funding.approve'), validate(idParam, 'params'), validate(rejectS), ah(c.reject));
router.post('/:id/void', authorize('fuel_funding.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

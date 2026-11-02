const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, decimal } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/vehicleLogController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const noBlank = (s) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM');
const km = decimal(1).refine((n) => n >= 0 && n <= 999999999, 'Enter a valid mileage');

// total mileage is NOT accepted: the server calculates it (final - initial). Final mileage and ending time are empty while the trip is open.
const fields = {
  tripDate: noBlank(date), userName: text(100).min(2, 'Enter the name of the user'), purpose: text(200).min(2, 'Enter the purpose of the trip'),
  timeStart: time, startKm: km, timeEnd: opt(time), endKm: opt(km), notes: opt(text(1000)),
};
const createS = z.object({ vehicleId: uuid, ...fields });
const updateS = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');   // the vehicle itself can never be changed
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const range = (q) => !q.from || !q.to || q.from <= q.to;
const listQ = z.object({
  search: text(80).optional(), vehicleId: uuid.optional(), status: z.enum(['ACTIVE', 'VOIDED', 'ALL']).default('ALL'), open: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  from: date.optional(), to: date.optional(), sortBy: z.enum(['tripDate', 'tripNo', 'totalKm']).default('tripDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, { message: '"from" must not be after "to"', path: ['from'] });
const sheetQ = z.object({ vehicleId: uuid, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM'), format: z.enum(['json', 'xlsx']).optional() });

router.get('/', authorize('vehicle_log.read'), validate(listQ, 'query'), ah(c.list));
router.get('/sheet', authorize('vehicle_log.read'), validate(sheetQ, 'query'), ah(c.sheet));
router.post('/', authorize('vehicle_log.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('vehicle_log.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('vehicle_log.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.post('/:id/void', authorize('vehicle_log.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

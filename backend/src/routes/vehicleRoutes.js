const router = require('express').Router();
const { z, uuid, idParam, paging, bool, decimal, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/vehicleController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const TYPES = ['TRUCK', 'PICKUP', 'VAN', 'CAR', 'MOTORCYCLE', 'OTHER'];
const FUELS = ['DIESEL', 'PETROL', 'GAS', 'OTHER'];
const plateNo = z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9 -]+$/, 'Letters, digits, spaces and - only').transform((s) => s.toUpperCase().replace(/\s+/g, ' '));

// No defaults in `base`, so a PATCH never silently resets a field the caller did not send.
const base = {
  plateNo, make: text(60).min(2), model: opt(text(60)), year: opt(z.coerce.number().int().min(1950).max(2100)),
  vehicleType: z.enum(TYPES), fuelType: z.enum(FUELS),
  tankCapacityLitres: opt(decimal(2).refine((n) => n > 0 && n <= 100000, 'Enter a capacity between 0 and 100,000 litres')),
  driverId: opt(uuid),                                                    // setting or clearing it needs vehicles.assign (checked in the controller)
  notes: opt(text(255)),
};
const createS = z.object({ ...base, vehicleType: base.vehicleType.default('TRUCK'), fuelType: base.fuelType.default('DIESEL') });
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({
  search: text(80).optional(), isActive: bool.optional(), vehicleType: z.enum(TYPES).optional(), fuelType: z.enum(FUELS).optional(), driverId: uuid.optional(),
  sortBy: z.enum(['plateNo', 'code', 'make']).default('plateNo'), sortDir: z.enum(['asc', 'desc']).default('asc'), ...paging,
});

router.get('/', authorize('vehicles.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('vehicles.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('vehicles.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('vehicles.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('vehicles.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('vehicles.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

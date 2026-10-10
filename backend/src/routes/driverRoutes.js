const router = require('express').Router();
const { z, uuid, idParam, paging, bool, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/driverController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const licenseNo = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9\-/ ]+$/, 'Letters, digits, - and / only').transform((s) => s.toUpperCase().replace(/\s+/g, ' '));
const base = {
  fullName: text(100).min(2),
  phone: opt(z.string().trim().regex(/^[0-9+()\-\s]{6,30}$/, 'Enter a valid phone number')),
  licenseNo, licenseClass: opt(text(10).transform((s) => s.toUpperCase())), licenseExpiry: date,
  address: opt(text(255)), notes: opt(text(255)), staffId: opt(uuid),
};
const createS = z.object(base);
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({
  search: text(80).optional(), isActive: bool.optional(), licenseStatus: z.enum(['VALID', 'EXPIRING_SOON', 'EXPIRED']).optional(),
  sortBy: z.enum(['fullName', 'code', 'licenseExpiry']).default('fullName'), sortDir: z.enum(['asc', 'desc']).default('asc'), ...paging,
});

router.get('/', authorize('drivers.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('drivers.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('drivers.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('drivers.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('drivers.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('drivers.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

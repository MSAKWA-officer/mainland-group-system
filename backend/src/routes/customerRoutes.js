const router = require('express').Router();
const { z, uuid, idParam, paging, bool, text, money } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/customerController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());     // "" from a form means "empty"
const phone = text(30).regex(/^[0-9+()\-\s]{6,30}$/, 'Enter a valid phone number');
const base = {
  name: text(150).min(2), type: z.enum(['INDIVIDUAL', 'COMPANY']),
  contactPerson: opt(text(100)), phone: opt(phone), email: opt(z.string().trim().toLowerCase().email().max(150)),
  address: opt(text(255)), city: opt(text(80)), tin: opt(text(30).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and - only')),
  creditLimit: money, paymentTermsDays: z.coerce.number().int().min(0).max(365),
  salespersonId: opt(uuid), notes: opt(text(2000)),
};
const createS = z.object({ ...base, type: base.type.default('INDIVIDUAL'), creditLimit: money.default(0), paymentTermsDays: base.paymentTermsDays.default(0) });
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), type: z.enum(['INDIVIDUAL', 'COMPANY']).optional(), salespersonId: uuid.optional(), isActive: bool.optional(), ...paging });

router.get('/', authorize('customers.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('customers.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('customers.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('customers.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('customers.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('customers.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

const router = require('express').Router();
const { z, idParam, paging, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/staffController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const base = {
  fullName: text(100).min(2),
  phone: opt(z.string().trim().regex(/^[0-9+()\-\s]{6,30}$/, 'Enter a valid phone number')),
  email: opt(z.string().trim().toLowerCase().email().max(150)),
  position: opt(text(80)), address: opt(text(255)),
};
const createS = z.object(base);
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), isActive: bool.optional(), account: z.enum(['with', 'without']).optional(), ...paging });

router.get('/', authorize('staff.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('staff.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('staff.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('staff.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('staff.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('staff.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

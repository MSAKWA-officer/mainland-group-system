const router = require('express').Router();
const { z, uuid, idParam, paging, bool, text, money } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/salespersonController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const base = {
  userId: opt(uuid), fullName: text(100).min(2), phone: opt(z.string().trim().regex(/^[0-9+()\-\s]{6,30}$/, 'Enter a valid phone number')),
  email: opt(z.string().trim().toLowerCase().email().max(150)), region: opt(text(80)),
  commissionRate: z.coerce.number().min(0).max(100).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most 2 decimal places'),
  monthlyTarget: money,
};
const createS = z.object({ ...base, fullName: base.fullName.optional() });     // name defaults to the linked user's name
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), isActive: bool.optional(), ...paging });
const monthQ = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional() });

// "me" routes need a login only: every signed-in salesperson can load their own profile and performance.
router.get('/me', ah(c.me));
router.get('/me/summary', validate(monthQ, 'query'), ah(c.summary));

router.get('/', authorize('salespersons.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('salespersons.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('salespersons.read'), validate(idParam, 'params'), ah(c.getOne));
router.get('/:id/summary', authorize('salespersons.read'), validate(idParam, 'params'), validate(monthQ, 'query'), ah(c.summary));
router.patch('/:id', authorize('salespersons.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('salespersons.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('salespersons.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

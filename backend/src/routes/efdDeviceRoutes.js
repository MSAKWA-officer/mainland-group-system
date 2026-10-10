const router = require('express').Router();
const { z, idParam, paging, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/efdDeviceController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const serial = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and - only').transform((s) => s.toUpperCase());
const tin = z.string().trim().min(5).max(30).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and - only');
const base = { serialNo: serial, name: text(100).min(2), tin, vrn: opt(text(30).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and - only')), location: opt(text(150)), notes: opt(text(255)) };
const createS = z.object(base);
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), isActive: bool.optional(), ...paging });

router.get('/', authorize('efd_devices.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('efd_devices.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('efd_devices.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('efd_devices.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('efd_devices.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('efd_devices.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

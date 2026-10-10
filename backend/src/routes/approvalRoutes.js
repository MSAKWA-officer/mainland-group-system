const router = require('express').Router();
const { z } = require('zod');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/approvalController');

const uuid = z.object({ id: z.string().uuid() });
const note = z.object({ note: z.string().trim().max(500).optional() });
const listQ = z.object({ status: z.string().max(12).optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
const createS = z.object({ type: z.string().max(60), entityType: z.string().max(60).optional(),
  entityId: z.string().max(100).optional(), payload: z.record(z.any()).default({}) });
const updateS = z.object({ type: z.string().max(60), payload: z.record(z.any()) }).partial()
  .refine((o) => Object.keys(o).length, 'Nothing to update');

router.get('/types', authorize('approvals.read'), c.types);
router.get('/', authorize('approvals.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('approvals.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('approvals.read'), validate(uuid, 'params'), ah(c.getOne));
router.patch('/:id', authorize('approvals.create'), validate(uuid, 'params'), validate(updateS), ah(c.update));
router.delete('/:id', authorize('approvals.create'), validate(uuid, 'params'), ah(c.remove));
router.post('/:id/submit', authorize('approvals.create'), validate(uuid, 'params'), ah(c.submit));
router.post('/:id/cancel', authorize('approvals.create'), validate(uuid, 'params'), ah(c.cancel));
router.post('/:id/approve', authorize('approvals.approve'), validate(uuid, 'params'), validate(note), ah(c.approve));
router.post('/:id/reject', authorize('approvals.approve'), validate(uuid, 'params'), validate(note), ah(c.reject));

module.exports = router;

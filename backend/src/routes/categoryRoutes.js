const router = require('express').Router();
const { z, uuid, idParam, paging, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/categoryController');

const listQ = z.object({ search: text(80).optional(), parentId: uuid.optional(), isActive: bool.optional(), ...paging, limit: z.coerce.number().int().min(1).max(500).default(100) });
const base = { name: text(80).min(2), description: text(255).nullable().optional(), parentId: uuid.nullable().optional() };
const createS = z.object(base);
const updateS = z.object({ ...base, isActive: z.boolean() }).partial().refine((o) => Object.keys(o).length, 'Nothing to update');

router.get('/', authorize('categories.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('categories.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('categories.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('categories.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.delete('/:id', authorize('categories.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

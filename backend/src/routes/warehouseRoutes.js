const router = require('express').Router();
const { z, uuid, idParam, paging, bool, text, date, quantity0 } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/warehouseController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const createS = z.object({ name: text(100).min(2), location: opt(text(255)), description: opt(text(255)), storekeeperIds: z.array(uuid).max(20).optional() });
const updateS = z.object({ name: text(100).min(2), location: opt(text(255)), description: opt(text(255)), storekeeperIds: z.array(uuid).max(20),
  isDefault: z.literal(true) }).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), isActive: bool.optional(), ...paging });
const reorderP = z.object({ id: uuid, itemId: uuid });
const reorderS = z.object({ reorderLevel: quantity0.nullable() });   // null = use the item's default level
const stockQ = z.object({ search: text(80).optional(), ...paging });
const mvQ = z.object({ itemId: uuid.optional(), type: text(20).optional(), from: date.optional(), to: date.optional(), ...paging });

// "options" and "storekeepers" come before "/:id". options needs a login only (it is limited to the warehouses the user may use).
router.get('/options', ah(c.options));
router.get('/storekeepers', authorize('warehouses.assign'), ah(c.storekeepers));
router.get('/', authorize('warehouses.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('warehouses.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('warehouses.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('warehouses.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('warehouses.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.get('/:id/stock', authorize('warehouses.read'), validate(idParam, 'params'), validate(stockQ, 'query'), ah(c.stock));
// A Manager sets the minimum stock of an item for one warehouse (overrides the item's company-wide reorder level there).
router.put('/:id/reorder-levels/:itemId', authorize('warehouses.update'), validate(reorderP, 'params'), validate(reorderS), ah(c.setReorderLevel));
router.get('/:id/movements', authorize('warehouses.read'), validate(idParam, 'params'), validate(mvQ, 'query'), ah(c.movements));
module.exports = router;

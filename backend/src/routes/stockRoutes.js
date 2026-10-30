const router = require('express').Router();
const { z, uuid, paging, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/stockController');

const listQ = z.object({ search: text(80).optional(), categoryId: uuid.optional(), isActive: bool.optional(),
  status: z.enum(['in_stock', 'low', 'out']).optional(),
  warehouseId: uuid.optional(), ...paging });   // warehouseId: quantities of that warehouse only
const itemParam = z.object({ itemId: uuid });
const batchParam = z.object({ batchId: uuid });
const batchQ = z.object({ includeEmpty: bool.optional(), warehouseId: uuid.optional() });   // warehouseId: only the batches held in that warehouse
const writeOffB = z.object({ warehouseId: uuid.optional() });
const expiryQ = z.object({ includeEmpty: bool.optional(), days: z.coerce.number().int().min(0).max(365).optional() });

router.get('/', authorize('stock.read'), validate(listQ, 'query'), ah(c.list));
router.get('/expiry-batches', authorize('expired.read'), validate(expiryQ, 'query'), ah(c.expiryBatches));   // before /:itemId
router.get('/expiry-batches/:batchId', authorize('expired.read'), validate(batchParam, 'params'), ah(c.expiryBatch));
router.post('/expiry-batches/:batchId/write-off', authorize('expired.create'), validate(batchParam, 'params'), validate(writeOffB), ah(c.writeOffExpiredBatch));   // delete an expired batch from its warehouse(s)
router.get('/:itemId', authorize('stock.read'), validate(itemParam, 'params'), ah(c.getOne));
router.get('/:itemId/batches', authorize('stock.read'), validate(itemParam, 'params'), validate(batchQ, 'query'), ah(c.batches));
module.exports = router;

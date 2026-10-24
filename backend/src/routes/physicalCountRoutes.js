const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, quantity0 } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/physicalCountController');

const line = z.object({ itemId: uuid, countedQty: quantity0, remarks: text(255).nullable().optional() });
const createS = z.object({ warehouseId: uuid, countDate: date, note: text(500).nullable().optional(), lines: z.array(line).min(1).max(1000) });
const voidS = z.object({ reason: text(500).min(3) });
const listQ = z.object({ status: z.enum(['POSTED', 'VOID']).optional(), search: text(80).optional(), warehouseId: uuid.optional(), from: date.optional(), to: date.optional(), ...paging });
const sheetQ = z.object({ warehouseId: uuid, date: date.optional() });

// "/sheet" comes before "/:id".
router.get('/sheet', authorize('physical_counts.create'), validate(sheetQ, 'query'), ah(c.sheet));
router.get('/', authorize('physical_counts.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('physical_counts.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('physical_counts.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('physical_counts.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

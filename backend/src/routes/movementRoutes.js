const router = require('express').Router();
const { z, uuid, idParam, paging, date } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/movementController');

const listQ = z.object({ itemId: uuid.optional(), documentId: uuid.optional(), performedBy: uuid.optional(),
  movementType: z.enum(['RECEIVING', 'ADJUSTMENT', 'REJECT_IN', 'REJECT_OUT', 'EXPIRED', 'DAMAGED', 'SALE', 'SALE_CANCEL']).optional(),
  direction: z.enum(['IN', 'OUT']).optional(), from: date.optional(), to: date.optional(), ...paging });
const movId = z.object({ id: z.coerce.number().int().positive() });

router.get('/', authorize('movements.read'), validate(listQ, 'query'), ah(c.list));
router.get('/:id', authorize('movements.read'), validate(movId, 'params'), ah(c.getOne));
module.exports = router;

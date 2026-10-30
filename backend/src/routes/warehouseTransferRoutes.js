const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, quantity } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/warehouseTransferController');

const line = z.object({ itemId: uuid, quantity, batchId: uuid.nullable().optional(), remarks: text(255).nullable().optional() });
const createS = z.object({ fromWarehouseId: uuid, toWarehouseId: uuid, transferDate: date.optional(), reason: text(1000).min(3, 'A reason is required'),
  lines: z.array(line).min(1).max(200) });
const listQ = z.object({ status: z.enum(['SUBMITTED', 'IN_TRANSIT', 'COMPLETED', 'RECEIVED_SHORT', 'NOT_RECEIVED', 'REJECTED', 'CANCELLED', 'VOIDED']).optional(), search: text(80).optional(), warehouseId: uuid.optional(),
  from: date.optional(), to: date.optional(), ...paging });
const note = z.object({ note: text(500).optional() });
// outcome FULL (default) | SHORT (lines[].receivedQty, a note is required) | NONE (nothing arrived, a note is required)
const receiveS = z.object({ outcome: z.enum(['FULL', 'SHORT', 'NONE']).optional(), note: text(500).optional(),
  lines: z.array(z.object({ lineId: uuid, receivedQty: z.coerce.number().min(0) })).max(200).optional() });

router.get('/', authorize('warehouse_transfers.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('warehouse_transfers.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('warehouse_transfers.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/cancel', authorize('warehouse_transfers.create'), validate(idParam, 'params'), ah(c.cancel));
router.post('/:id/receive', authorize('warehouse_transfers.receive'), validate(idParam, 'params'), validate(receiveS), ah(c.receive));
router.post('/:id/reverse', authorize('warehouse_transfers.approve'), validate(idParam, 'params'), validate(z.object({ reason: text(500).min(3, 'A reason is required') })), ah(c.reverse));   // delete a transfer that already moved stock
router.post('/:id/approve', authorize('warehouse_transfers.approve'), validate(idParam, 'params'), validate(note), ah(c.approve));
router.post('/:id/reject', authorize('warehouse_transfers.approve'), validate(idParam, 'params'), validate(note), ah(c.reject));
module.exports = router;

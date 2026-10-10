const router = require('express').Router();
const { z, uuid, idParam, paging, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/efdReceiptController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const code = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and - only');
// There is deliberately no PATCH and no DELETE: a recorded fiscal receipt is only ever voided.
const createS = z.object({ deviceId: uuid, salesOrderId: uuid, receiptNo: code, verificationCode: opt(code), issuedAt: opt(z.string().datetime({ offset: true })) });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const listQ = z.object({ status: z.enum(['ISSUED', 'VOIDED']).optional(), deviceId: uuid.optional(), salesOrderId: uuid.optional(),
  search: text(80).optional(), from: date.optional(), to: date.optional(), ...paging });

router.get('/', authorize('efd_receipts.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('efd_receipts.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('efd_receipts.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('efd_receipts.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

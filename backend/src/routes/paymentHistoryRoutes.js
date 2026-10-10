const router = require('express').Router();
const { z, uuid, idParam, paging, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/paymentHistoryController');

const listQ = z.object({
  search: text(80).optional(), customerId: uuid.optional(), salespersonId: uuid.optional(), receivedBy: uuid.optional(),
  saleType: z.enum(['CASH', 'CREDIT']).optional(), method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CARD', 'CHEQUE']).optional(),
  status: z.enum(['ACTIVE', 'VOIDED', 'ALL']).default('ACTIVE'),
  from: date.optional(), to: date.optional(),
  sortBy: z.enum(['paidOn', 'amount', 'receiptNo', 'customer']).default('paidOn'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('payment_history.read'), validate(listQ, 'query'), ah(c.list));
router.get('/:id', authorize('payment_history.read'), validate(idParam, 'params'), ah(c.getOne));
module.exports = router;

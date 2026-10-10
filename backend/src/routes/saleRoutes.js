const router = require('express').Router();
const { z, uuid, idParam, paging, date, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/saleController');

// SALES register: read-only view of cash + credit sales. Per-type permissions (cash_sales.read / credit_sales.read) decide which rows appear.
const listQ = z.object({ saleType: z.enum(['CASH', 'CREDIT']).optional(), status: z.enum(['DRAFT', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'VOIDED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(), customerId: uuid.optional(), salespersonId: uuid.optional(), createdBy: uuid.optional(),
  search: text(80).optional(), from: date.optional(), to: date.optional(), overdue: bool.optional(), ...paging });
const summaryQ = z.object({ from: date.optional(), to: date.optional() });

router.get('/summary', authorize('sales.summary'), validate(summaryQ, 'query'), ah(c.summary));        // must stay above /:id
router.get('/', authorize('sales.read'), validate(listQ, 'query'), ah(c.list));
router.get('/:id', authorize('sales.read'), validate(idParam, 'params'), ah(c.getOne));
module.exports = router;

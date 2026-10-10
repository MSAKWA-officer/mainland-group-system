const router = require('express').Router();
const { z, uuid, paging, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/customerBalanceController');

const listQ = z.object({
  search: text(80).optional(), customerId: uuid.optional(), salespersonId: uuid.optional(), isActive: bool.optional(),
  includeZero: bool.default('false'),          // also list customers who owe nothing
  overdueOnly: bool.default('false'),          // only customers with an overdue amount
  sortBy: z.enum(['balance', 'overdue', 'name', 'code', 'creditLimit', 'lastPaymentOn']).default('balance'),
  sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
});
const custParam = z.object({ customerId: uuid });

router.get('/', authorize('customer_balances.read'), validate(listQ, 'query'), ah(c.list));
router.get('/:customerId', authorize('customer_balances.read'), validate(custParam, 'params'), ah(c.getOne));
module.exports = router;

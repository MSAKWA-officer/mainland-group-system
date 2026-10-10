const router = require('express').Router();
const { z, uuid, paging, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/creditAgeingController');

const listQ = z.object({
  search: text(80).optional(), customerId: uuid.optional(), salespersonId: uuid.optional(),
  asOf: date.optional(),                                   // report date, default today
  bucket: z.enum(['CURRENT', 'DAYS_1_30', 'DAYS_31_60', 'DAYS_61_90', 'OVER_90']).optional(),   // only customers with money in this bucket
  sortBy: z.enum(['outstanding', 'oldest', 'name', 'over90']).default('outstanding'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
});
const custParam = z.object({ customerId: uuid });
const detailQ = z.object({ asOf: date.optional() });

router.get('/', authorize('credit_ageing.read'), validate(listQ, 'query'), ah(c.list));
router.get('/:customerId', authorize('credit_ageing.read'), validate(custParam, 'params'), validate(detailQ, 'query'), ah(c.getOne));
module.exports = router;

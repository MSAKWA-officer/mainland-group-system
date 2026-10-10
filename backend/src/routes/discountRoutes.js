const router = require('express').Router();
const { z, uuid, idParam, paging, bool, date, text, decimal } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/discountController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const base = {
  name: text(100).min(2), description: opt(text(255)),
  percent: decimal(2).refine((n) => n > 0 && n <= 100, 'Percent must be greater than 0 and at most 100'),
  scope: z.enum(['ALL', 'CATEGORY', 'ITEM']), categoryId: opt(uuid), itemId: opt(uuid), customerId: opt(uuid),
  minQuantity: decimal(3).refine((n) => n >= 0 && n <= 1000000, 'Minimum quantity must be between 0 and 1,000,000'),
  validFrom: date, validTo: opt(date),
};
const createS = z.object({ ...base, scope: base.scope.default('ALL'), minQuantity: base.minQuantity.default(0), validFrom: base.validFrom.optional() });
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), scope: z.enum(['ALL', 'CATEGORY', 'ITEM']).optional(), customerId: uuid.optional(),
  isActive: bool.optional(), current: bool.optional(), ...paging });
const availableQ = z.object({ itemId: uuid, customerId: uuid, quantity: decimal(3).refine((n) => n > 0 && n <= 1000000, 'Quantity must be between 0 and 1,000,000').default(1) });

router.get('/', authorize('discounts.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('discounts.create'), validate(createS), ah(c.create));
// Used by the order form: only needs discounts.apply, and only returns discounts valid right now for that item and customer.
router.get('/available', authorize('discounts.apply'), validate(availableQ, 'query'), ah(c.available));
router.get('/:id', authorize('discounts.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('discounts.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('discounts.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('discounts.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

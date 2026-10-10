const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, decimal } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/salesOrderController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const line = z.object({
  itemId: uuid,
  quantity: decimal(3).refine((n) => n > 0 && n <= 1000000, 'Quantity must be between 0 and 1,000,000'),
  unitPrice: opt(decimal(2).refine((n) => n >= 0 && n <= 100000000, 'Price must be between 0 and 100,000,000')),   // needs sales_orders.set_price
  discountPercent: opt(decimal(2).refine((n) => n >= 0 && n <= 100, 'Discount must be between 0 and 100')),        // custom % needs sales_orders.set_price
  discountId: opt(uuid),                                                                                             // ready-made discount, needs discounts.apply
});
const head = {
  customerId: uuid, salespersonId: opt(uuid), orderDate: date, deliveryDate: opt(date), notes: opt(text(2000)),
  taxRate: decimal(2).refine((n) => n >= 0 && n <= 100, 'Tax rate must be between 0 and 100'),
};
const createS = z.object({ ...head, orderDate: head.orderDate.optional(), taxRate: head.taxRate.optional(), lines: z.array(line).min(1).max(200) });
const updateS = z.object({ ...head, lines: z.array(line).min(1).max(200) }).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const listQ = z.object({ status: z.enum(['DRAFT', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'CANCELLED']).optional(), customerId: uuid.optional(),
  salespersonId: uuid.optional(), createdBy: uuid.optional(), search: text(80).optional(), from: date.optional(), to: date.optional(), ...paging });
const cancelS = z.object({ reason: text(500).optional() });
const noteS = z.object({ note: text(500).optional() });

router.get('/', authorize('sales_orders.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('sales_orders.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('sales_orders.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('sales_orders.create'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.delete('/:id', authorize('sales_orders.create'), validate(idParam, 'params'), ah(c.remove));
router.post('/:id/submit', authorize('sales_orders.create'), validate(idParam, 'params'), ah(c.submit));
// Cancel: the creator may cancel a draft / submitted order; cancelling a CONFIRMED order needs sales_orders.approve (checked in the service).
router.post('/:id/cancel', authorize('sales_orders.read'), validate(idParam, 'params'), validate(cancelS), ah(c.cancel));
router.post('/:id/approve', authorize('sales_orders.approve'), validate(idParam, 'params'), validate(noteS), ah(c.approve));
router.post('/:id/reject', authorize('sales_orders.approve'), validate(idParam, 'params'), validate(noteS), ah(c.reject));
module.exports = router;

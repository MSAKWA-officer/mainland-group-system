const router = require('express').Router();
const { z, uuid, idParam, paging, bool, text, money, quantity0 } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/itemController');

const listQ = z.object({ search: text(80).optional(), categoryId: uuid.optional(), isActive: bool.optional(), trackExpiry: bool.optional(), ...paging });
const sku = z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, 'Letters, digits, . _ - only').transform((s) => s.toUpperCase());
const base = {
  name: text(150).min(2), description: text(2000).nullable().optional(), barcode: text(60).nullable().optional(),
  categoryId: uuid, unit: text(20).min(1).default('pcs'),
  costPrice: money.optional(), sellingPrice: money.optional(), reorderLevel: quantity0.optional(),
  trackExpiry: z.boolean().default(false),
};
const createS = z.object({ sku: sku.optional(), ...base });
const updateS = z.object({ sku, ...base }).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });

router.get('/', authorize('items.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('items.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('items.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('items.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('items.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('items.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

const router = require('express').Router();
const { z, uuid, paging, date, bool, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/reportController');

const days = z.coerce.number().int().min(0).max(365);
const range = { from: date.optional(), to: date.optional() };
const summaryQ = z.object({ days: days.default(30) });
const onHandQ = z.object({ search: text(80).optional(), categoryId: uuid.optional(), includeZero: bool.optional(), ...paging });
const pageQ = z.object({ ...paging });
const expiryQ = z.object({ days: days.default(30), includeExpired: bool.default('true'), ...paging });
const movementsQ = z.object({ ...range, groupBy: z.enum(['type', 'item']).default('type'), ...paging });
const rangeQ = z.object({ ...range });

router.get('/summary', authorize('stock_reports.read'), validate(summaryQ, 'query'), ah(c.summary));
router.get('/stock-on-hand', authorize('stock_reports.read'), validate(onHandQ, 'query'), ah(c.stockOnHand));
router.get('/low-stock', authorize('stock_reports.read'), validate(pageQ, 'query'), ah(c.lowStock));
router.get('/expiry', authorize('stock_reports.read'), validate(expiryQ, 'query'), ah(c.expiry));
router.get('/movements', authorize('stock_reports.read'), validate(movementsQ, 'query'), ah(c.movements));
router.get('/write-offs', authorize('stock_reports.read'), validate(rangeQ, 'query'), ah(c.writeOffs));
router.get('/valuation', authorize('stock_reports.read', 'stock_reports.valuation'), ah(c.valuation));
module.exports = router;

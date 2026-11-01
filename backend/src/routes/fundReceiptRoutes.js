const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, money } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/fundReceiptController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const SOURCES = ['OWNER_CAPITAL', 'HEAD_OFFICE', 'LOAN', 'GRANT', 'OTHER'];
const PURPOSES = ['FUEL', 'EXPENSES', 'OTHER'];
const amount = money.refine((n) => n > 0, 'Amount must be greater than 0');
const range = (q) => !q.from || !q.to || q.from <= q.to;
const rangeMsg = { message: '"from" must not be after "to"', path: ['from'] };

const createS = z.object({
  bankAccountId: uuid, source: z.enum(SOURCES), receivedFrom: text(150).min(2, 'Say who the money came from'), purpose: z.enum(PURPOSES),
  amount, receiptDate: date.optional(), reference: opt(text(100)), notes: opt(text(1000)),
});
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const listQ = z.object({
  search: text(80).optional(), bankAccountId: uuid.optional(), source: z.enum(SOURCES).optional(), purpose: z.enum(PURPOSES).optional(),
  status: z.enum(['POSTED', 'VOIDED', 'ALL']).default('ALL'), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['receiptDate', 'amount', 'receiptNo']).default('receiptDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, rangeMsg);
const summaryQ = z.object({ from: date.optional(), to: date.optional(), groupBy: z.enum(['purpose', 'source', 'account']).default('purpose') }).refine(range, rangeMsg);

router.get('/', authorize('fund_receipts.read'), validate(listQ, 'query'), ah(c.list));
router.get('/summary', authorize('fund_receipts.read'), validate(summaryQ, 'query'), ah(c.summary));
router.post('/', authorize('fund_receipts.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('fund_receipts.read'), validate(idParam, 'params'), ah(c.getOne));
router.post('/:id/void', authorize('fund_receipts.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

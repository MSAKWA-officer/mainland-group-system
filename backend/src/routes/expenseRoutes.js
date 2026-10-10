const router = require('express').Router();
const { z, uuid, idParam, paging, date, text, money } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/expenseController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const CATEGORIES = ['RENT', 'UTILITIES', 'SALARIES', 'TRANSPORT', 'FUEL', 'MARKETING', 'MAINTENANCE', 'OFFICE', 'TAXES', 'BANK_CHARGES', 'OTHER'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'VOIDED'];
const amount = money.refine((n) => n > 0, 'Amount must be greater than 0');

const fields = {
  category: z.enum(CATEGORIES), description: text(255).min(3, 'Describe the expense'), payee: opt(text(150)), reference: opt(text(100)),
  amount, expenseDate: date.optional(), notes: opt(text(1000)),
};
const createS = z.object(fields);
const updateS = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');
const approveS = z.object({ note: opt(text(500)) });
const rejectS = z.object({ note: text(500).min(3, 'Give a reason for rejecting this expense') });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const range = (q) => !q.from || !q.to || q.from <= q.to;
const rangeMsg = { message: '"from" must not be after "to"', path: ['from'] };
const listQ = z.object({
  search: text(80).optional(), category: z.enum(CATEGORIES).optional(), status: z.enum([...STATUSES, 'ALL']).default('ALL'),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(), createdBy: uuid.optional(), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['expenseDate', 'amount', 'expenseNo', 'category']).default('expenseDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, rangeMsg);
const summaryQ = z.object({ from: date.optional(), to: date.optional() }).refine(range, rangeMsg);

router.get('/', authorize('expenses.read'), validate(listQ, 'query'), ah(c.list));
router.get('/summary', authorize('expenses.read'), validate(summaryQ, 'query'), ah(c.summary));
router.post('/', authorize('expenses.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('expenses.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('expenses.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.post('/:id/approve', authorize('expenses.approve'), validate(idParam, 'params'), validate(approveS), ah(c.approve));
router.post('/:id/reject', authorize('expenses.approve'), validate(idParam, 'params'), validate(rejectS), ah(c.reject));
router.post('/:id/void', authorize('expenses.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

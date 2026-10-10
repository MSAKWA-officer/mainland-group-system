const router = require('express').Router();
const { z, uuid, idParam, paging, bool, text, money, date } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/bankAccountController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const TYPES = ['CURRENT', 'SAVINGS', 'MOBILE_MONEY', 'OTHER'];
const accountNo = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9 -]+$/, 'Letters, digits, spaces and - only');
const currency = z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use the 3-letter currency code, e.g. TZS').transform((s) => s.toUpperCase());
const base = { bankId: uuid, accountNo, accountName: text(150).min(2), accountType: z.enum(TYPES), currency, branch: opt(text(100)),
  openingBalance: money, openingDate: date, allowOverdraft: z.boolean(), notes: opt(text(255)) };
const { bankId, accountNo: no, accountName } = base;
const createS = z.object({ bankId, accountNo: no, accountName, accountType: base.accountType.default('CURRENT'), currency: currency.default('TZS'), branch: base.branch,
  openingBalance: money.default(0), openingDate: date.optional(), allowOverdraft: z.boolean().default(false), notes: base.notes });
const updateS = z.object(base).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ isActive: z.boolean(), reason: text(500).optional() });
const listQ = z.object({ search: text(80).optional(), bankId: uuid.optional(), accountType: z.enum(TYPES).optional(), currency: currency.optional(), isActive: bool.optional(), ...paging });
const statementQ = z.object({ from: date.optional(), to: date.optional(), page: paging.page, limit: z.coerce.number().int().min(1).max(500).default(100) })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('bank_accounts.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('bank_accounts.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('bank_accounts.read'), validate(idParam, 'params'), ah(c.getOne));
router.get('/:id/statement', authorize('bank_accounts.view_balance', 'bank_transactions.read'), validate(idParam, 'params'), validate(statementQ, 'query'), ah(c.statement));
router.patch('/:id', authorize('bank_accounts.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.patch('/:id/status', authorize('bank_accounts.deactivate'), validate(idParam, 'params'), validate(statusS), ah(c.setStatus));
router.delete('/:id', authorize('bank_accounts.delete'), validate(idParam, 'params'), ah(c.remove));
module.exports = router;

const router = require('express').Router();
const { z, uuid, idParam, paging, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/efdZReportController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const amount = z.coerce.number().refine((n) => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most 2 decimal places')
  .refine((n) => n >= 0 && n <= 999999999999, 'Amount must be 0 or more');
const count = z.coerce.number().int('Whole number').min(0).max(1000000);
const code = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and - only');
const STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'VOIDED'];

const fields = {
  reportDate: date, zNumber: z.string().trim().regex(/^[0-9]{1,20}$/, 'Digits only (the Z number printed by the device)'),
  receiptsCount: count, grossAmount: amount, vatAmount: amount,
  voidedCount: count.optional(), voidedAmount: amount.optional(),
  firstReceiptNo: opt(code), lastReceiptNo: opt(code), notes: opt(text(1000)),
};
const createS = z.object({ deviceId: uuid, ...fields });
const updateS = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');   // the device cannot be changed: void the report and record a new one
const verifyS = z.object({ note: opt(text(500)) });
const rejectS = z.object({ note: text(500).min(3, 'Give a reason for rejecting this Z report') });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const range = (q) => !q.from || !q.to || q.from <= q.to;
const listQ = z.object({
  search: text(80).optional(), status: z.enum([...STATUSES, 'ALL']).default('ALL'), deviceId: uuid.optional(), createdBy: uuid.optional(),
  from: date.optional(), to: date.optional(),
  sortBy: z.enum(['reportDate', 'reportNo', 'grossAmount', 'zNumber']).default('reportDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/', authorize('efd_z_reports.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('efd_z_reports.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('efd_z_reports.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('efd_z_reports.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.post('/:id/verify', authorize('efd_z_reports.verify'), validate(idParam, 'params'), validate(verifyS), ah(c.verify));
router.post('/:id/reject', authorize('efd_z_reports.verify'), validate(idParam, 'params'), validate(rejectS), ah(c.reject));
router.post('/:id/void', authorize('efd_z_reports.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
// There is deliberately no DELETE: a Z report is a fiscal record and is only ever voided.
module.exports = router;

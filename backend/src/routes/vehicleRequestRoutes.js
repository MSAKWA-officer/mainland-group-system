const router = require('express').Router();
const { z, uuid, idParam, paging, date, text } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/vehicleRequestController');

const opt = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const noBlank = (s) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'KEY_OUT', 'RETURNED', 'VOIDED'];
const stamp = noBlank(z.string().datetime({ message: 'Use a valid date and time' }));

const fields = {
  requestDate: noBlank(date), userName: text(100).min(2, "Enter the user's name"), department: text(100).min(2, 'Enter the department'),
  purpose: text(255).min(3, 'Say what the vehicle is needed for'), notes: opt(text(1000)),
};
const createS = z.object(fields);
const updateS = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');
const approveS = z.object({ note: opt(text(500)) });
const rejectS = z.object({ note: text(500).min(3, 'Give a reason for rejecting this request') });
const issueS = z.object({ vehicleId: uuid, driverId: noBlank(uuid), keyTakenAt: stamp });      // driver defaults to the vehicle's default driver; time defaults to now
const returnS = z.object({ keyReturnedAt: stamp });
const voidS = z.object({ reason: text(500).min(3, 'A reason is required') });
const range = (q) => !q.from || !q.to || q.from <= q.to;
const listQ = z.object({
  search: text(80).optional(), vehicleId: uuid.optional(), status: z.enum([...STATUSES, 'ALL']).default('ALL'), from: date.optional(), to: date.optional(),
  sortBy: z.enum(['requestDate', 'requestNo', 'createdAt']).default('requestDate'), sortDir: z.enum(['asc', 'desc']).default('desc'), ...paging,
}).refine(range, { message: '"from" must not be after "to"', path: ['from'] });
const registerQ = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM'), format: z.enum(['json', 'xlsx']).optional() });

router.get('/', authorize('vehicle_requests.read'), validate(listQ, 'query'), ah(c.list));
router.get('/register', authorize('vehicle_requests.read'), validate(registerQ, 'query'), (req, res, next) => (req.query.format === 'xlsx' ? authorize('vehicle_requests.export')(req, res, next) : next()), ah(c.register));
router.post('/', authorize('vehicle_requests.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('vehicle_requests.read'), validate(idParam, 'params'), ah(c.getOne));
router.patch('/:id', authorize('vehicle_requests.update'), validate(idParam, 'params'), validate(updateS), ah(c.update));
router.post('/:id/approve', authorize('vehicle_requests.approve'), validate(idParam, 'params'), validate(approveS), ah(c.approve));
router.post('/:id/reject', authorize('vehicle_requests.approve'), validate(idParam, 'params'), validate(rejectS), ah(c.reject));
router.post('/:id/issue-key', authorize('vehicle_requests.issue_key'), validate(idParam, 'params'), validate(issueS), ah(c.issueKey));
router.post('/:id/return-key', authorize('vehicle_requests.issue_key'), validate(idParam, 'params'), validate(returnS), ah(c.returnKey));
router.post('/:id/void', authorize('vehicle_requests.void'), validate(idParam, 'params'), validate(voidS), ah(c.void));
module.exports = router;

const router = require('express').Router();
const { z, uuid, paging, date } = require('../utils/schemas');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/efdDifferenceController');
const { TYPES, SEVERITIES } = require('../services/efdDifferences');

// Read-only. Dates default to the last 30 days; the service limits the range (92 days) and refuses a future end date.
const range = (q) => !q.from || !q.to || q.from <= q.to;
const scanQ = z.object({
  from: date.optional(), to: date.optional(), deviceId: uuid.optional(),
  type: z.enum(Object.keys(TYPES)).optional(), severity: z.enum(SEVERITIES).optional(), ...paging,
}).refine(range, { message: '"from" must not be after "to"', path: ['from'] });

router.get('/types', authorize('efd_differences.read'), ah(c.types));      // before / on purpose: static lists for the filters
router.get('/', authorize('efd_differences.read'), validate(scanQ, 'query'), ah(c.scan));
module.exports = router;

const router = require('express').Router();
const { z } = require('zod');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/deletedRecordsController');

const TYPES = ['RECEIVING', 'ADJUSTMENT', 'REJECT_IN', 'REJECT_OUT', 'EXPIRED', 'DAMAGED', 'CASH_SALE'];
const listQ = z.object({ type: z.enum(TYPES).optional(), search: z.string().max(80).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });

// The Owner always holds every permission and nobody else is given this one, so this page is Owner-only.
router.get('/', authorize('deleted_records.read'), validate(listQ, 'query'), ah(c.list));

module.exports = router;

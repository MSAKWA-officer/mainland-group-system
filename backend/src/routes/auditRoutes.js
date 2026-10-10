const router = require('express').Router();
const { z } = require('zod');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/auditController');

const listQ = z.object({ username: z.string().max(30).optional(), action: z.string().max(60).optional(), entityType: z.string().max(60).optional(),
  entityId: z.string().max(100).optional(), outcome: z.enum(['SUCCESS', 'DENIED', 'FAILED']).optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) });

router.get('/', authorize('audit.read'), validate(listQ, 'query'), ah(c.list));
router.get('/verify', authorize('audit.verify'), ah(c.verify));

module.exports = router;

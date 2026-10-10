const router = require('express').Router();
const { z } = require('zod');
const { ah } = require('../utils/errors');
const pw = require('../utils/password');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const { text, money } = require('../utils/schemas');
const c = require('../controllers/userController');

const uuid = z.object({ id: z.string().uuid() });
const listQ = z.object({ search: z.string().trim().max(60).optional(), role: z.string().max(30).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
const opt = (x) => z.preprocess((v) => (v === '' ? null : v), x.nullable().optional());
// Accounts are created for an existing staff member; name, phone and email are taken from the staff record.
// region / commissionRate / monthlyTarget are only used when the role is Sales Person.
const createS = z.object({
  staffId: z.string().uuid(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, '3-30 letters, digits, . _ -'),
  roleId: z.string().uuid(), password: pw.passwordRule,
  region: opt(text(80)),
  commissionRate: z.coerce.number().min(0).max(100).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most 2 decimal places').optional(),
  monthlyTarget: money.optional(),
});
const patchS = z.object({ fullName: z.string().trim().min(2).max(100), email: z.string().trim().email().max(150).nullable(),
  phone: z.string().trim().max(30).nullable(), roleId: z.string().uuid() }).partial().refine((o) => Object.keys(o).length, 'Nothing to update');
const statusS = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']), reason: z.string().trim().max(300).optional() });
const resetS = z.object({ newPassword: pw.passwordRule });

router.get('/', authorize('users.read'), validate(listQ, 'query'), ah(c.list));
router.post('/', authorize('users.create'), validate(createS), ah(c.create));
router.get('/:id', authorize('users.read'), validate(uuid, 'params'), ah(c.getOne));
router.patch('/:id', authorize('users.update'), validate(uuid, 'params'), validate(patchS), ah(c.update));
router.post('/:id/status', authorize('users.deactivate'), validate(uuid, 'params'), validate(statusS), ah(c.setStatus));
router.post('/:id/reset-password', authorize('users.reset_password'), validate(uuid, 'params'), validate(resetS), ah(c.resetPassword));

module.exports = router;

const router = require('express').Router();
const { z } = require('zod');
const { ah } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/roleController');

const uuid = z.object({ id: z.string().uuid() });
const permsS = z.object({ permissionIds: z.array(z.string().uuid()).max(200) });

router.get('/roles', authorize('roles.read'), ah(c.listRoles));
router.get('/permissions', authorize('roles.read'), ah(c.listPermissions));
router.put('/roles/:id/permissions', authorize('roles.manage'), validate(uuid, 'params'), validate(permsS), ah(c.setRolePermissions));

module.exports = router;

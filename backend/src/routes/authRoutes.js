const router = require('express').Router();
const { z } = require('zod');
const { ah } = require('../utils/errors');
const pw = require('../utils/password');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/authController');

const loginS = z.object({ username: z.string().min(1).max(30), password: z.string().min(1).max(72) });
const changePwS = z.object({ currentPassword: z.string().min(1).max(72), newPassword: pw.passwordRule });

router.post('/login', loginLimiter, validate(loginS), ah(c.login));
router.post('/refresh', ah(c.refresh));
router.post('/logout', ah(c.logout));
router.get('/me', authenticate, c.me);
router.post('/change-password', authenticate, validate(changePwS), ah(c.changePassword));

module.exports = router;

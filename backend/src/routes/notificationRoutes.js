const router = require('express').Router();
const { ah } = require('../utils/errors');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/notificationController');

router.get('/', authorize('notifications.read'), ah(c.list));
router.post('/read-all', authorize('notifications.read'), ah(c.readAll));

module.exports = router;

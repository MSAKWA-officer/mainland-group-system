const router = require('express').Router();
const { ah } = require('../utils/errors');
const { authorize } = require('../middleware/auth');
const c = require('../controllers/monitoringController');

router.get('/summary', authorize('monitoring.read'), ah(c.summary));

module.exports = router;

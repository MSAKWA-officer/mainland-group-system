const router = require('express').Router();
const { ah } = require('../utils/errors');
const c = require('../controllers/dashboardController');

// Open to every signed-in user: the service only returns figures for modules the user is permitted to read.
router.get('/summary', ah(c.summary));

module.exports = router;

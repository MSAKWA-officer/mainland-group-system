const router = require('express').Router();
const { ah } = require('../utils/errors');
const { authorize } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const c = require('../controllers/fileController');

router.post('/', authorize('files.upload'), upload.single('file'), ah(c.upload));
router.get('/:id', authorize('files.read'), ah(c.download));

module.exports = router;

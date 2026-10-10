const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const env = require('../config/env');
const { AppError } = require('../utils/errors');

const dir = path.resolve(env.UPLOAD_DIR); // outside any web-served folder
fs.mkdirSync(dir, { recursive: true });
const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
const MAGIC = { 'application/pdf': [0x25, 0x50, 0x44, 0x46], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47] };

const upload = multer({
  storage: multer.diskStorage({ destination: dir, filename: (r, f, cb) => cb(null, crypto.randomUUID() + EXT[f.mimetype]) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (r, f, cb) => EXT[f.mimetype] ? cb(null, true) : cb(new AppError(400, 'FILE_TYPE', 'Only PDF, JPG or PNG files are allowed')),
});
const magicOk = (file) => {
  const fd = fs.openSync(file.path, 'r'); const b = Buffer.alloc(4);
  fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
  return MAGIC[file.mimetype].every((x, i) => b[i] === x);
};
module.exports = { upload, magicOk, dir };

const fs = require('fs');
const path = require('path');
const { sequelize, Attachment } = require('../models');
const { AppError } = require('../utils/errors');
const { sha256 } = require('../utils/crypto');
const { magicOk, dir } = require('../middleware/upload');
const audit = require('../services/audit');

exports.upload = async (req, res) => {
  const f = req.file; if (!f) throw new AppError(400, 'NO_FILE', 'Choose a file to upload');
  if (!magicOk(f)) { fs.unlinkSync(f.path); throw new AppError(400, 'FILE_CONTENT', 'The file content does not match its type'); }
  const name = path.basename(f.originalname).replace(/[^\w.\- ]/g, '_').slice(0, 200);
  const a = await sequelize.transaction(async (t) => {
    const a = await Attachment.create({ originalName: name, storedName: f.filename, mime: f.mimetype, size: f.size,
      sha256: sha256(fs.readFileSync(f.path)), uploadedBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'FILE_UPLOADED', entityType: 'Attachment', entityId: a.id, newValues: { name, size: f.size, sha256: a.sha256 } }, t);
    return a;
  });
  res.status(201).json({ id: a.id, name: a.originalName, size: a.size, mime: a.mime });
};

exports.download = async (req, res) => {
  const a = /^[0-9a-f-]{36}$/.test(req.params.id) && await Attachment.findByPk(req.params.id);
  if (!a || (a.uploadedBy !== req.user.id && !req.user.permissions.has('approvals.read_all'))) throw new AppError(404, 'NOT_FOUND', 'File not found');
  await audit.log(req, { action: 'FILE_DOWNLOADED', entityType: 'Attachment', entityId: a.id });
  res.download(path.join(dir, a.storedName), a.originalName);
};

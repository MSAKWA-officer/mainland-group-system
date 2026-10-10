const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const Attachment = sequelize.define('Attachment', {
  id, originalName: str(255, { allowNull: false }), storedName: str(80, { allowNull: false }),
  mime: str(80, { allowNull: false }), size: { type: D.INTEGER, allowNull: false }, sha256: str(64, { allowNull: false }),
  uploadedBy: { type: D.UUID, allowNull: false }, entityType: str(60), entityId: str(100),
}, { tableName: 'attachments', updatedAt: false });
module.exports = Attachment;

const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const Session = sequelize.define('Session', {
  id, userId: { type: D.UUID, allowNull: false }, refreshHash: str(64, { allowNull: false }),
  ip: str(64), userAgent: str(255), expiresAt: { type: D.DATE, allowNull: false }, revokedAt: D.DATE,
}, { tableName: 'sessions', updatedAt: false });
module.exports = Session;

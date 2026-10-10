const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const AuditLog = sequelize.define('AuditLog', {
  id: { type: D.BIGINT, autoIncrement: true, primaryKey: true },
  occurredAt: { type: D.DATE, allowNull: false }, userId: D.UUID, username: str(30),
  action: str(60, { allowNull: false }), entityType: str(60), entityId: str(100),
  oldValues: D.JSONB, newValues: D.JSONB, reason: D.TEXT,
  outcome: str(10, { allowNull: false, defaultValue: 'SUCCESS' }), ip: str(64), userAgent: str(255),
  prevHash: str(64, { allowNull: false }), hash: str(64, { allowNull: false }),
}, { tableName: 'audit_logs', timestamps: false });
module.exports = AuditLog;

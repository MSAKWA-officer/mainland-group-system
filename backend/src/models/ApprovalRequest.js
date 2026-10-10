const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const ApprovalRequest = sequelize.define('ApprovalRequest', {
  id, type: str(60, { allowNull: false }), entityType: str(60), entityId: str(100),
  payload: { type: D.JSONB, allowNull: false, defaultValue: {} },
  status: str(12, { allowNull: false, defaultValue: 'DRAFT' }),
  requestedBy: { type: D.UUID, allowNull: false }, submittedAt: D.DATE,
  decidedBy: D.UUID, decidedAt: D.DATE, decisionNote: D.TEXT, executedAt: D.DATE,
}, { tableName: 'approval_requests' });
module.exports = ApprovalRequest;

const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });

const WarehouseTransfer = sequelize.define('WarehouseTransfer', {
  id, transferNo: str(30, { allowNull: false, unique: true }), fromWarehouseId: { type: D.UUID, allowNull: false }, toWarehouseId: { type: D.UUID, allowNull: false },
  status: str(12, { allowNull: false, defaultValue: 'SUBMITTED' }), transferDate: D.DATEONLY,   // DB default is CURRENT_DATE
  reason: D.TEXT, approvalId: D.UUID, createdBy: { type: D.UUID, allowNull: false }, submittedAt: D.DATE, completedAt: D.DATE,
  requiresReceipt: { type: D.BOOLEAN, allowNull: false, defaultValue: false }, approvedAt: D.DATE, receivedBy: D.UUID, receivedAt: D.DATE, receiveNote: str(500),
}, { tableName: 'warehouse_transfers' });
module.exports = WarehouseTransfer;

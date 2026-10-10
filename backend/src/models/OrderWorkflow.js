const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// Where a sales order is in the Salesperson -> Storekeeper -> Manager -> Salesperson chain.
const OrderWorkflow = sequelize.define('OrderWorkflow', {
  id, orderId: { type: D.UUID, allowNull: false, unique: true }, approvalId: D.UUID,
  status: str(24, { allowNull: false, defaultValue: 'AWAITING_STOREKEEPER' }),
  cycle: { type: D.INTEGER, allowNull: false, defaultValue: 1 },
  submittedBy: { type: D.UUID, allowNull: false }, submittedAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
  storekeeperId: D.UUID, storekeeperAt: D.DATE, storekeeperNote: D.TEXT,
  managerId: D.UUID, managerAt: D.DATE, managerNote: D.TEXT,
  returnedFrom: str(12), returnedBy: D.UUID, returnedAt: D.DATE, returnNote: D.TEXT,
  completedBy: D.UUID, completedAt: D.DATE, completedNote: D.TEXT,
}, { tableName: 'order_workflows' });
module.exports = OrderWorkflow;

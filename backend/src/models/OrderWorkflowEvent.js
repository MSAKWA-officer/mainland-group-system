const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// One row per step ever taken on an order (history is never rewritten).
const OrderWorkflowEvent = sequelize.define('OrderWorkflowEvent', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  workflowId: { type: D.UUID, allowNull: false }, orderId: { type: D.UUID, allowNull: false },
  cycle: { type: D.INTEGER, allowNull: false }, action: str(30, { allowNull: false }),
  fromStatus: str(24), toStatus: str(24, { allowNull: false }),
  actorId: { type: D.UUID, allowNull: false }, actorRole: str(30, { allowNull: false }), note: D.TEXT,
}, { tableName: 'order_workflow_events', updatedAt: false });
module.exports = OrderWorkflowEvent;

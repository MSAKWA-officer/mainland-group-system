const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };

// One stock-take of one warehouse on one day. Never changes stock; the Warehouse Inventory Statement reads it.
const PhysicalCount = sequelize.define('PhysicalCount', {
  id, countNo: { type: D.STRING(30), allowNull: false, unique: true }, warehouseId: { type: D.UUID, allowNull: false },
  countDate: { type: D.DATEONLY, allowNull: false }, status: { type: D.STRING(8), allowNull: false, defaultValue: 'POSTED' },   // POSTED | VOID
  note: D.STRING(500), createdBy: { type: D.UUID, allowNull: false },
  voidedBy: D.UUID, voidedAt: D.DATE, voidReason: D.STRING(500),
}, { tableName: 'physical_counts' });
module.exports = PhysicalCount;

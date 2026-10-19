const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });

// Which storekeepers are in charge of which warehouse.
const WarehouseStorekeeper = sequelize.define('WarehouseStorekeeper', {
  warehouseId: { type: D.UUID, primaryKey: true }, userId: { type: D.UUID, primaryKey: true }, assignedBy: { type: D.UUID, allowNull: false },
}, { tableName: 'warehouse_storekeepers', updatedAt: false });
module.exports = WarehouseStorekeeper;

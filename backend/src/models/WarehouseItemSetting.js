const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');

// Reorder level of one item in one warehouse. Overrides items.reorder_level for that warehouse only.
const WarehouseItemSetting = sequelize.define('WarehouseItemSetting', {
  warehouseId: { type: D.UUID, primaryKey: true }, itemId: { type: D.UUID, primaryKey: true },
  reorderLevel: { type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0 }, updatedBy: { type: D.UUID, allowNull: false },
}, { tableName: 'warehouse_item_settings' });
module.exports = WarehouseItemSetting;

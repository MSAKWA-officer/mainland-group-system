const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });

// Quantity of one item in one warehouse. Only ever changed by services/stockLedger.js (atomic SQL).
const WarehouseStock = sequelize.define('WarehouseStock', {
  warehouseId: { type: D.UUID, primaryKey: true }, itemId: { type: D.UUID, primaryKey: true }, quantity: qty(),
}, { tableName: 'warehouse_stock', createdAt: false });
module.exports = WarehouseStock;

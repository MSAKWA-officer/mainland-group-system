const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

// One row per item. Quantity is only ever changed by services/stockLedger.js (atomic SQL), never by app code.
const StockLevel = sequelize.define('StockLevel', {
  itemId: { type: D.UUID, primaryKey: true }, quantity: qty(),
}, { tableName: 'stock_levels', createdAt: false });
module.exports = StockLevel;

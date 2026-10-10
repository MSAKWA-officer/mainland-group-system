const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

const StockBatch = sequelize.define('StockBatch', {
  id, itemId: { type: D.UUID, allowNull: false }, batchNo: str(60, { allowNull: false }),
  expiryDate: { type: D.DATEONLY, allowNull: false }, quantity: qty(),
}, { tableName: 'stock_batches' });
module.exports = StockBatch;

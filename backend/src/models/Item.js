const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

const Item = sequelize.define('Item', {
  id, sku: str(40, { allowNull: false, unique: true }), name: str(150, { allowNull: false }), description: D.TEXT,
  barcode: str(60), categoryId: { type: D.UUID, allowNull: false }, unit: str(20, { allowNull: false, defaultValue: 'pcs' }),
  costPrice: money(), sellingPrice: money(), reorderLevel: qty(),
  trackExpiry: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'items' });
module.exports = Item;

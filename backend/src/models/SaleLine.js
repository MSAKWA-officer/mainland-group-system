const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// sku / itemName / unit are snapshots so a sale keeps reading correctly if the item is renamed later.
const SaleLine = sequelize.define('SaleLine', {
  id, saleId: { type: D.UUID, allowNull: false }, itemId: { type: D.UUID, allowNull: false },
  sku: str(40, { allowNull: false }), itemName: str(150, { allowNull: false }), unit: str(20, { allowNull: false }),
  quantity: { type: D.DECIMAL(14, 3), allowNull: false }, unitPrice: { type: D.DECIMAL(14, 2), allowNull: false },
  discountPercent: { type: D.DECIMAL(5, 2), allowNull: false, defaultValue: 0 }, lineTotal: money(),
}, { tableName: 'sale_lines', updatedAt: false });
module.exports = SaleLine;

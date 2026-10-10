const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const Discount = sequelize.define('Discount', {
  id, code: str(20, { allowNull: false, unique: true }), name: str(100, { allowNull: false }), description: str(255),
  percent: { type: D.DECIMAL(5, 2), allowNull: false }, scope: str(10, { allowNull: false, defaultValue: 'ALL' }),
  categoryId: D.UUID, itemId: D.UUID, customerId: D.UUID,
  minQuantity: { type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  validFrom: D.DATEONLY,                       // DB default is CURRENT_DATE
  validTo: D.DATEONLY,
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'discounts' });
module.exports = Discount;

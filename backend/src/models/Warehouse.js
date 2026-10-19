const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });

const Warehouse = sequelize.define('Warehouse', {
  id, code: str(20, { allowNull: false, unique: true }), name: str(100, { allowNull: false }), location: str(255), description: str(255),
  isDefault: { type: D.BOOLEAN, allowNull: false, defaultValue: false },   // receives stock / issues sales when no warehouse is named
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'warehouses' });
module.exports = Warehouse;

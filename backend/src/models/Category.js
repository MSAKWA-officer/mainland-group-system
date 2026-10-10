const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

const Category = sequelize.define('Category', {
  id, name: str(80, { allowNull: false }), description: str(255), parentId: D.UUID,
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'categories' });
module.exports = Category;

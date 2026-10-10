const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const Permission = sequelize.define('Permission', {
  id, code: str(60, { allowNull: false, unique: true }), module: str(40, { allowNull: false }), description: D.TEXT,
}, { tableName: 'permissions' });
module.exports = Permission;

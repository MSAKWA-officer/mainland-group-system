const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const Role = sequelize.define('Role', {
  id, code: str(30, { allowNull: false, unique: true }), name: str(60, { allowNull: false }),
  level: { type: D.INTEGER, allowNull: false }, description: D.TEXT,
  isSystem: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'roles' });
module.exports = Role;

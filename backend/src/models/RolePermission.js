const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const RolePermission = sequelize.define('RolePermission', {
  roleId: { type: D.UUID, primaryKey: true }, permissionId: { type: D.UUID, primaryKey: true },
}, { tableName: 'role_permissions', timestamps: false });
module.exports = RolePermission;

const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const User = sequelize.define('User', {
  id, username: str(30, { allowNull: false, unique: true }), fullName: str(100, { allowNull: false }),
  email: str(150), phone: str(30), passwordHash: str(100, { allowNull: false }),
  roleId: { type: D.UUID, allowNull: false },
  status: str(10, { allowNull: false, defaultValue: 'ACTIVE' }),
  failedAttempts: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  lockedUntil: D.DATE, lastLoginAt: D.DATE,
  mustChangePassword: { type: D.BOOLEAN, allowNull: false, defaultValue: true },
  passwordChangedAt: D.DATE, createdBy: D.UUID,
}, { tableName: 'users' });
module.exports = User;

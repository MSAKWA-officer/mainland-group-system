const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const Bank = sequelize.define('Bank', {
  id, code: str(20, { allowNull: false, unique: true }), name: str(120, { allowNull: false }), shortName: str(30), swiftCode: str(11),
  country: str(2, { allowNull: false, defaultValue: 'TZ' }), phone: str(30), website: str(150), notes: str(255),
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'banks' });
module.exports = Bank;

const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// A person who drives company vehicles. May be linked to a staff record (staffId); not every driver needs a login account.
const Driver = sequelize.define('Driver', {
  id, code: str(20, { allowNull: false, unique: true }), fullName: str(100, { allowNull: false }), phone: str(30),
  licenseNo: str(40, { allowNull: false }), licenseClass: str(10), licenseExpiry: { type: D.DATEONLY, allowNull: false },
  address: str(255), notes: str(255), staffId: D.UUID,
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'drivers' });
module.exports = Driver;

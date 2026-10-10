const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const Staff = sequelize.define('Staff', {
  id, code: str(20, { allowNull: false, unique: true }), fullName: str(100, { allowNull: false }),
  phone: str(30), email: str(150), position: str(80), address: str(255),
  userId: D.UUID,   // set when the Owner gives this person a login account
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'staff' });
module.exports = Staff;

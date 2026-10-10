const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const EfdDevice = sequelize.define('EfdDevice', {
  id, serialNo: str(40, { allowNull: false, unique: true }), name: str(100, { allowNull: false }), tin: str(30, { allowNull: false }),
  vrn: str(30), location: str(150), notes: str(255),
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'efd_devices' });
module.exports = EfdDevice;

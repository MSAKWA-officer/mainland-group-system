const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const Salesperson = sequelize.define('Salesperson', {
  id, code: str(20, { allowNull: false, unique: true }), userId: D.UUID, fullName: str(100, { allowNull: false }),
  phone: str(30), email: str(150), region: str(80), warehouseId: D.UUID,
  commissionRate: { type: D.DECIMAL(5, 2), allowNull: false, defaultValue: 0 }, monthlyTarget: money(),
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'salespersons' });
module.exports = Salesperson;

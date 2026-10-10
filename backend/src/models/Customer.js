const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const Customer = sequelize.define('Customer', {
  id, code: str(20, { allowNull: false, unique: true }), name: str(150, { allowNull: false }), type: str(12, { allowNull: false, defaultValue: 'INDIVIDUAL' }),
  contactPerson: str(100), phone: str(30), email: str(150), address: str(255), city: str(80), tin: str(30),
  creditLimit: money(), paymentTermsDays: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  salespersonId: D.UUID, notes: D.TEXT,
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'customers' });
module.exports = Customer;

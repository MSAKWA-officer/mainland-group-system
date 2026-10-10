const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const CustomerPaymentAllocation = sequelize.define('CustomerPaymentAllocation', {
  id, customerPaymentId: { type: D.UUID, allowNull: false }, saleId: { type: D.UUID, allowNull: false },
  salePaymentId: { type: D.UUID, allowNull: false, unique: true }, amount: { type: D.DECIMAL(20, 2), allowNull: false },
}, { tableName: 'customer_payment_allocations', updatedAt: false });
module.exports = CustomerPaymentAllocation;

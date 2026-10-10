const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const CustomerPayment = sequelize.define('CustomerPayment', {
  id, paymentNo: str(30, { allowNull: false, unique: true }), customerId: { type: D.UUID, allowNull: false },
  amount: { type: D.DECIMAL(20, 2), allowNull: false }, method: str(15, { allowNull: false }), bankAccountId: D.UUID,
  reference: str(100), paidOn: D.DATEONLY, notes: D.TEXT,                       // paid_on DB default is CURRENT_DATE
  status: str(8, { allowNull: false, defaultValue: 'ACTIVE' }),
  receivedBy: { type: D.UUID, allowNull: false }, voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'customer_payments' });
module.exports = CustomerPayment;

const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const SalePayment = sequelize.define('SalePayment', {
  id, receiptNo: str(30, { allowNull: false, unique: true }), saleId: { type: D.UUID, allowNull: false },
  amount: { type: D.DECIMAL(20, 2), allowNull: false }, tendered: D.DECIMAL(20, 2),
  method: str(15, { allowNull: false }), reference: str(100), paidOn: D.DATEONLY, notes: D.TEXT,
  bankAccountId: D.UUID, receivedBy: { type: D.UUID, allowNull: false }, voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'sale_payments' });
module.exports = SalePayment;

const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// Fiscal record. DB triggers block DELETE and any change except ISSUED -> VOIDED.
const EfdReceipt = sequelize.define('EfdReceipt', {
  id, deviceId: { type: D.UUID, allowNull: false }, salesOrderId: { type: D.UUID, allowNull: false },
  receiptNo: str(40, { allowNull: false }), verificationCode: str(40), issuedAt: D.DATE,
  amount: money(), vatAmount: money(), customerTin: str(30),
  status: str(10, { allowNull: false, defaultValue: 'ISSUED' }),
  voidReason: D.TEXT, voidedAt: D.DATE, voidedBy: D.UUID, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'efd_receipts' });
module.exports = EfdReceipt;

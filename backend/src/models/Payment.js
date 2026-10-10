const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// Money PAID OUT (to a supplier, landlord, staff ...). Optionally settles an approved expense.
// Money received from customers is a different thing: see CustomerPayment.
const Payment = sequelize.define('Payment', {
  id, paymentNo: str(30, { allowNull: false, unique: true }), expenseId: D.UUID, payee: str(150, { allowNull: false }),
  amount: { type: D.DECIMAL(20, 2), allowNull: false }, method: str(15, { allowNull: false }), bankAccountId: D.UUID,
  reference: str(100), paidOn: D.DATEONLY, notes: D.TEXT,                       // paid_on DB default is CURRENT_DATE
  status: str(8, { allowNull: false, defaultValue: 'ACTIVE' }),
  createdBy: { type: D.UUID, allowNull: false }, voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'payments' });
module.exports = Payment;

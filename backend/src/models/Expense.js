const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// A business expense. Flow: PENDING -> APPROVED | REJECTED, and PENDING / APPROVED -> VOIDED (only while nothing has been paid).
// How much has been paid is never stored: it is the sum of the ACTIVE payments linked to the expense.
const Expense = sequelize.define('Expense', {
  id, expenseNo: str(30, { allowNull: false, unique: true }), category: str(20, { allowNull: false }),
  description: str(255, { allowNull: false }), payee: str(150), reference: str(100),
  amount: { type: D.DECIMAL(20, 2), allowNull: false }, expenseDate: { type: D.DATEONLY, allowNull: false }, notes: D.TEXT,
  status: str(10, { allowNull: false, defaultValue: 'PENDING' }),
  createdBy: { type: D.UUID, allowNull: false },
  decidedBy: D.UUID, decidedAt: D.DATE, decisionNote: D.TEXT,
  voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'expenses' });
module.exports = Expense;

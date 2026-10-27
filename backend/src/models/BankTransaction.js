const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// Ledger row. type decides direction: DEPOSIT / TRANSFER_IN / INTEREST / CUSTOMER_PAYMENT = CREDIT, WITHDRAWAL / TRANSFER_OUT / CHARGE = DEBIT.
const BankTransaction = sequelize.define('BankTransaction', {
  id, txnNo: str(30, { allowNull: false, unique: true }), bankAccountId: { type: D.UUID, allowNull: false },
  type: str(20, { allowNull: false }), direction: str(6, { allowNull: false }),
  amount: { type: D.DECIMAL(20, 2), allowNull: false }, txnDate: { type: D.DATEONLY, allowNull: false },
  reference: str(100), description: str(255), counterparty: str(150),
  transferGroupId: D.UUID, customerPaymentId: D.UUID, paymentId: D.UUID, fuelFundingId: D.UUID, salePaymentId: D.UUID,
  status: str(8, { allowNull: false, defaultValue: 'POSTED' }),
  isReconciled: { type: D.BOOLEAN, allowNull: false, defaultValue: false }, reconciledAt: D.DATE, reconciledBy: D.UUID,
  voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
  createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'bank_transactions' });
module.exports = BankTransaction;

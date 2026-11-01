const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// Money received into a bank account and earmarked for a purpose (FUEL / EXPENSES / OTHER). Flow: POSTED -> VOIDED. Never deleted.
// The bank balance is not stored here: the receipt posts one DEPOSIT row to the bank ledger (bank_transactions.fund_receipt_id).
const FundReceipt = sequelize.define('FundReceipt', {
  id, receiptNo: str(30, { allowNull: false, unique: true }), bankAccountId: { type: D.UUID, allowNull: false },
  source: str(15, { allowNull: false }), receivedFrom: str(150, { allowNull: false }), purpose: str(10, { allowNull: false }),
  amount: { type: D.DECIMAL(20, 2), allowNull: false }, receiptDate: { type: D.DATEONLY, allowNull: false },
  reference: str(100), notes: D.TEXT,
  status: str(8, { allowNull: false, defaultValue: 'POSTED' }),
  voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
  createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'fund_receipts' });
module.exports = FundReceipt;

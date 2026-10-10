const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// One table for both CASH and CREDIT sales (saleType). status: DRAFT -> SUBMITTED -> COMPLETED | REJECTED | CANCELLED | VOIDED
const Sale = sequelize.define('Sale', {
  id, saleNo: str(30, { allowNull: false, unique: true }), saleType: str(6, { allowNull: false }),
  customerId: D.UUID, walkInName: str(150), walkInPhone: str(30), salespersonId: D.UUID,
  status: str(12, { allowNull: false, defaultValue: 'DRAFT' }),
  saleDate: D.DATEONLY,                         // DB default is CURRENT_DATE
  dueDate: D.DATEONLY, notes: D.TEXT,
  taxRate: { type: D.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  subtotal: money(), discountTotal: money(), taxTotal: money(), total: money(), amountPaid: money(),
  paymentStatus: str(8, { allowNull: false, defaultValue: 'UNPAID' }),
  approvalId: D.UUID, stockDocumentId: D.UUID, cancelDocumentId: D.UUID,
  createdBy: { type: D.UUID, allowNull: false },
  submittedAt: D.DATE, completedAt: D.DATE, cancelledAt: D.DATE, voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'sales' });
module.exports = Sale;

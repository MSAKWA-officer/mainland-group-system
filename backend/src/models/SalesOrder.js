const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const SalesOrder = sequelize.define('SalesOrder', {
  id, orderNo: str(30, { allowNull: false, unique: true }), customerId: { type: D.UUID, allowNull: false }, salespersonId: { type: D.UUID, allowNull: false },
  status: str(12, { allowNull: false, defaultValue: 'DRAFT' }),
  orderDate: D.DATEONLY,                       // DB default is CURRENT_DATE
  deliveryDate: D.DATEONLY, notes: D.TEXT,
  saleType: str(6, { allowNull: false, defaultValue: 'CASH' }),   // CASH | CREDIT: decides which sale record is created on approval
  dueDate: D.DATEONLY,                                          // credit orders only
  paymentMethod: str(15), paymentReference: str(100),           // cash orders only
  taxRate: { type: D.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  subtotal: money(), discountTotal: money(), taxTotal: money(), total: money(),
  approvalId: D.UUID, stockDocumentId: D.UUID, cancelDocumentId: D.UUID,
  createdBy: { type: D.UUID, allowNull: false }, submittedAt: D.DATE, confirmedAt: D.DATE, cancelledAt: D.DATE, cancelReason: D.TEXT,
}, { tableName: 'sales_orders' });
module.exports = SalesOrder;
